/**********************************************************************
 * embeddingService - Node.js Microservice for Text Embeddings
 *
 * Stage 6 Refactor: Added final confirmation log for each file.
 *********************************************************************/

const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const dotenv = require("dotenv");
const fs = require("fs-extra");
const path = require("path");
const cors = require("cors");

const { TextLoader } = require("langchain/document_loaders/fs/text");
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const { DocxLoader } = require("@langchain/community/document_loaders/fs/docx");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { InMemoryStore } = require("langchain/storage/in_memory");

const { OpenAIEmbeddings } = require("@langchain/openai");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const {
  OpenSearchVectorStore,
} = require("@langchain/community/vectorstores/opensearch");
const { Client: OSClient } = require("@opensearch-project/opensearch");

dotenv.config();

const {
  EMBEDDING_PROVIDER = "gemini",
  OPENAI_API_KEY,
  GEMINI_API_KEY,
  OPENSEARCH_HOST = "localhost",
  OPENSEARCH_PORT = "9200",
  OPENSEARCH_INDEX_NAME = "knowledge_base",
  PORT = 8001,
  PARENT_CHUNK_SIZE = 2000,
  PARENT_CHUNK_OVERLAP = 200,
  CHILD_CHUNK_SIZE = 400,
  CHILD_CHUNK_OVERLAP = 50,
  EMBED_DIM = 768,
} = process.env;

const app = express();
app.use(cors());
app.use(express.json());

let docstore = new InMemoryStore();

const openSearchClient = new OSClient({
  node: `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`,
});

let embeddings;
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

fs.ensureDirSync("./temp");
const upload = multer({ dest: "./temp" });

async function ensureIndexExists() {
  const exists = await openSearchClient.indices.exists({
    index: OPENSEARCH_INDEX_NAME,
  });
  if (!exists.body) {
    await openSearchClient.indices.create({
      index: OPENSEARCH_INDEX_NAME,
      body: {
        settings: { index: { knn: true, "knn.algo_param.ef_search": 100 } },
        mappings: {
          properties: {
            embedding: { type: "knn_vector", dimension: EMBED_DIM },
          },
        },
      },
    });
  }
}

app.post("/upload", upload.array("files"), async (req, res) => {
  const files = req.files;
  console.log(
    `[Upload] Received ${files.length} file(s) for processing: ${files
      .map((f) => f.originalname)
      .join(", ")}`
  );

  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files uploaded." });
  }

  try {
    await ensureIndexExists();
    const parentSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: parseInt(PARENT_CHUNK_SIZE),
      chunkOverlap: parseInt(PARENT_CHUNK_OVERLAP),
    });
    const childSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: parseInt(CHILD_CHUNK_SIZE),
      chunkOverlap: parseInt(CHILD_CHUNK_OVERLAP),
    });

    let allStats = [];

    for (const file of req.files) {
      console.log(
        `[Processing] Starting 'Small-to-Big' processing for: ${file.originalname}`
      );
      let loader;
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === ".pdf") loader = new PDFLoader(file.path);
      else if (ext === ".docx") loader = new DocxLoader(file.path);
      else loader = new TextLoader(file.path);

      const docs = await loader.load();
      const parentChunks = await parentSplitter.splitDocuments(docs);
      const parentDocIds = parentChunks.map(() => uuidv4());
      await docstore.mset(
        parentChunks.map((chunk, i) => [parentDocIds[i], chunk])
      );

      let childChunks = [];
      for (let i = 0; i < parentChunks.length; i++) {
        const subDocs = await childSplitter.splitDocuments([parentChunks[i]]);
        subDocs.forEach((doc) => {
          doc.metadata.parentId = parentDocIds[i];
          childChunks.push(doc);
        });
      }
      if (childChunks.length > 0) {
        await OpenSearchVectorStore.fromDocuments(childChunks, embeddings, {
          client: openSearchClient,
          indexName: OPENSEARCH_INDEX_NAME,
        });
      }
      // --- FINAL LOGGING FIX ---
      console.log(
        `[Success] Finished processing ${file.originalname}. Created ${parentChunks.length} parent chunks and ${childChunks.length} child chunks.`
      );
      allStats.push({
        file: file.originalname,
        parentChunks: parentChunks.length,
        childChunks: childChunks.length,
      });

      await fs.unlink(file.path);
    }
    res.status(200).json({
      success: true,
      message: "All files processed.",
      stats: allStats,
    });
  } catch (error) {
    console.error("[Upload] Critical error during upload:", error);
    res
      .status(500)
      .json({ error: "An unexpected error occurred during upload." });
  }
});

app.post("/get-documents", async (req, res) => {
  const { ids } = req.body;
  console.log(`[get-documents] Received request for ${ids?.length || 0} IDs.`);

  if (!ids || !Array.isArray(ids)) {
    return res
      .status(400)
      .json({ error: "Request body must be an object with an 'ids' array." });
  }
  try {
    const documents = await docstore.mget(ids);
    const foundDocuments = documents.filter((doc) => doc !== undefined);
    console.log(
      `[get-documents] Successfully found ${foundDocuments.length} documents.`
    );
    res.status(200).json({ documents: foundDocuments });
  } catch (error) {
    console.error("[get-documents] Error fetching from docstore:", error);
    res.status(500).json({ error: "Failed to retrieve documents." });
  }
});

app.post("/clear-docstore", (req, res) => {
  docstore = new InMemoryStore();
  console.log(`[Admin] In-memory docstore has been reset.`);
  res.status(200).send({ message: "Document store cleared." });
});

app.get("/health", (req, res) => res.status(200).json({ status: "healthy" }));

app.listen(process.env.PORT || 8001, async () => {
  console.log(`Embedding Service running on port ${process.env.PORT || 8001}`);
  await ensureIndexExists();
});
