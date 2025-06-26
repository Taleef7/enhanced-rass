/**********************************************************************
 * embeddingService - Node.js Microservice for Text Embeddings
 *
 * Stage 2 Refactor: "Small-to-Big" Retrieval Pattern
 * - Implements ParentDocumentRetriever logic.
 * - Uses two text splitters: one for large parent chunks and one
 * for smaller child chunks.
 * - Stores large parent chunks in an in-memory key-value store.
 * - Embeds and indexes ONLY the small child chunks into OpenSearch.
 * - Each child chunk's metadata includes a reference to its parent.
 * - Adds /get-documents endpoint for rass-engine to fetch
 * parent documents from the docstore.
 * - FINAL FIX: Corrected /clear-docstore by re-instantiating the store.
 *********************************************************************/

const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const dotenv = require("dotenv");
const fs = require("fs-extra");
const path = require("path");
const cors = require("cors");

// Document Loaders & Parsers
const { TextLoader } = require("langchain/document_loaders/fs/text");
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const { DocxLoader } = require("@langchain/community/document_loaders/fs/docx");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { InMemoryStore } = require("langchain/storage/in_memory");

// Provider SDKs
const { OpenAIEmbeddings } = require("@langchain/openai");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const {
  OpenSearchVectorStore,
} = require("@langchain/community/vectorstores/opensearch");
const { Client: OSClient } = require("@opensearch-project/opensearch");

/**************** Load ENV ****************/
dotenv.config();

const {
  EMBEDDING_PROVIDER = "gemini",
  OPENAI_API_KEY,
  GEMINI_API_KEY,
  OPENSEARCH_HOST = "localhost",
  OPENSEARCH_PORT = "9200",
  OPENSEARCH_INDEX_NAME = "knowledge_base",
  TEMP_DIR = "./temp",
  PORT = 8001,
  PARENT_CHUNK_SIZE = 2000,
  PARENT_CHUNK_OVERLAP = 200,
  CHILD_CHUNK_SIZE = 400,
  CHILD_CHUNK_OVERLAP = 50,
  EMBED_DIM = 768,
} = process.env;

/**************** Initialize Clients & Stores ****************/
const app = express();
app.use(cors());
app.use(express.json());

// This will act as our key-value store for the large parent documents.
// DECLARED WITH LET to allow re-assignment for clearing the store.
let docstore = new InMemoryStore();

// OpenSearch Client
const openSearchClient = new OSClient({
  node: `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`,
});

// Embedding Model
let embeddings;
console.log(
  `[Initialization] Initializing Embedding Model via provider: ${EMBEDDING_PROVIDER}`
);
if (EMBEDDING_PROVIDER === "gemini") {
  embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: GEMINI_API_KEY,
    modelName: "text-embedding-004",
  });
} else {
  embeddings = new OpenAIEmbeddings({
    apiKey: OPENAI_API_KEY,
    model: "text-embedding-3-small",
  });
}

/**************** Middleware & Setup ***************/
fs.ensureDirSync(TEMP_DIR);
const upload = multer({ dest: TEMP_DIR });

/**************** Helper Functions ****************/

async function ensureIndexExists() {
  try {
    const exists = await openSearchClient.indices.exists({
      index: OPENSEARCH_INDEX_NAME,
    });
    if (!exists.body) {
      console.log(
        `[OpenSearch] Index '${OPENSEARCH_INDEX_NAME}' not found. Creating...`
      );
      await openSearchClient.indices.create({
        index: OPENSEARCH_INDEX_NAME,
        body: {
          settings: {
            index: {
              knn: true,
              "knn.algo_param.ef_search": 100,
            },
          },
          mappings: {
            properties: {
              embedding: {
                type: "knn_vector",
                dimension: EMBED_DIM,
              },
            },
          },
        },
      });
      console.log(
        `[OpenSearch] Index '${OPENSEARCH_INDEX_NAME}' created successfully.`
      );
    } else {
      console.log(
        `[OpenSearch] Index '${OPENSEARCH_INDEX_NAME}' already exists.`
      );
    }
  } catch (error) {
    console.error("[OpenSearch] Error in ensureIndexExists:", error);
    throw error;
  }
}

/**************** API Routes ****************/

app.post("/upload", upload.array("files"), async (req, res) => {
  const files = req.files;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files uploaded." });
  }

  try {
    await ensureIndexExists();
    const processingStats = {
      filesProcessed: 0,
      totalParentChunks: 0,
      totalChildChunksEmbedded: 0,
      errors: [],
    };

    const parentSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: parseInt(PARENT_CHUNK_SIZE),
      chunkOverlap: parseInt(PARENT_CHUNK_OVERLAP),
    });
    const childSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: parseInt(CHILD_CHUNK_SIZE),
      chunkOverlap: parseInt(CHILD_CHUNK_OVERLAP),
    });

    for (const file of files) {
      console.log(
        `[Processing] Starting 'Small-to-Big' processing for: ${file.originalname}`
      );
      try {
        let loader;
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === ".pdf") loader = new PDFLoader(file.path);
        else if (ext === ".docx") loader = new DocxLoader(file.path);
        else loader = new TextLoader(file.path);

        const docs = await loader.load();
        if (!docs || docs.length === 0 || !docs[0].pageContent.trim()) {
          console.warn(
            `[Processing] No content extracted from ${file.originalname}. Skipping.`
          );
          continue;
        }

        const parentChunks = await parentSplitter.splitDocuments(docs);
        processingStats.totalParentChunks += parentChunks.length;
        console.log(
          `[Processing] Split ${file.originalname} into ${parentChunks.length} parent chunks.`
        );

        const parentDocIds = parentChunks.map(() => uuidv4());
        await docstore.mset(
          parentChunks.map((chunk, i) => [parentDocIds[i], chunk])
        );
        console.log(
          `[Processing] Stored ${parentChunks.length} parent chunks in memory.`
        );

        let childChunks = [];
        for (let i = 0; i < parentChunks.length; i++) {
          const subDocs = await childSplitter.splitDocuments([parentChunks[i]]);
          const subDocsWithParentId = subDocs.map((doc) => {
            doc.metadata.parentId = parentDocIds[i];
            return doc;
          });
          childChunks = childChunks.concat(subDocsWithParentId);
        }

        console.log(
          `[Processing] Created ${childChunks.length} child chunks for indexing.`
        );

        if (childChunks.length > 0) {
          console.log(
            `[Embedding] Embedding ${childChunks.length} child chunks into OpenSearch...`
          );
          await OpenSearchVectorStore.fromDocuments(childChunks, embeddings, {
            client: openSearchClient,
            indexName: OPENSEARCH_INDEX_NAME,
          });
          processingStats.totalChildChunksEmbedded += childChunks.length;
        }
        processingStats.filesProcessed++;
        console.log(`[Success] Successfully processed ${file.originalname}`);
      } catch (fileError) {
        console.error(
          `[Error] Failed to process ${file.originalname}:`,
          fileError
        );
        processingStats.errors.push({
          file: file.originalname,
          error: fileError.message,
        });
      } finally {
        await fs
          .unlink(file.path)
          .catch((err) =>
            console.error(
              `[Cleanup] Failed to delete temp file: ${err.message}`
            )
          );
      }
    }

    const response = {
      success: true,
      message: `Processing complete. Successfully processed ${processingStats.filesProcessed}/${files.length} files.`,
      stats: processingStats,
    };
    if (processingStats.errors.length > 0)
      response.errors = processingStats.errors;
    res.status(200).json(response);
  } catch (error) {
    console.error("[Upload] Critical endpoint error:", error);
    res.status(500).json({
      error: "An unexpected error occurred during file processing.",
      details: error.message,
    });
  }
});

app.post("/get-documents", async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res
      .status(400)
      .json({ error: "Request body must be an object with an 'ids' array." });
  }
  try {
    const documents = await docstore.mget(ids);
    const foundDocuments = documents.filter((doc) => doc !== undefined);
    res.status(200).json({ documents: foundDocuments });
  } catch (error) {
    console.error("[get-documents] Error fetching from docstore:", error);
    res.status(500).json({ error: "Failed to retrieve documents." });
  }
});

// --- FINAL CORRECTED ENDPOINT ---
app.post("/clear-docstore", (req, res) => {
  // The simplest and most robust way to clear the in-memory store is to re-instantiate it.
  docstore = new InMemoryStore();
  console.log(`[Admin] In-memory docstore has been reset.`);
  res.status(200).send({ message: "Document store cleared." });
});

app.get("/health", async (req, res) => {
  try {
    const osHealth = await openSearchClient.cluster.health();
    res.status(200).json({
      status: "healthy",
      service: "embedding-service",
      opensearch_status: osHealth.body.status,
    });
  } catch (error) {
    res.status(503).json({ status: "unhealthy", error: error.message });
  }
});

/**************** Start Server ****************/
app.listen(PORT, async () => {
  console.log(`Embedding Service running on http://localhost:${PORT}`);
  try {
    await ensureIndexExists();
  } catch (error) {
    console.error(
      `[Startup] CRITICAL: Could not connect to or create OpenSearch index.`,
      error
    );
    process.exit(1);
  }
});
