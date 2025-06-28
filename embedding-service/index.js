const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs-extra");
const path = require("path");
const cors = require("cors");
const yaml = require("js-yaml");

// LangChain and OpenSearch Imports
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

// --- Centralized Configuration Loading ---
const config = yaml.load(fs.readFileSync("./config.yml", "utf8"));
console.log("[Config] Loaded configuration from config.yml");

const { OPENAI_API_KEY, GEMINI_API_KEY } = process.env;
const {
  EMBEDDING_PROVIDER,
  OPENSEARCH_HOST,
  OPENSEARCH_PORT,
  OPENSEARCH_INDEX_NAME,
  EMBEDDING_SERVICE_PORT,
  PARENT_CHUNK_SIZE,
  PARENT_CHUNK_OVERLAP,
  CHILD_CHUNK_SIZE,
  CHILD_CHUNK_OVERLAP,
  EMBED_DIM,
  OPENAI_EMBED_MODEL_NAME,
  GEMINI_EMBED_MODEL_NAME,
} = config;
// --- End Configuration Loading ---

const app = express();
app.use(cors());
app.use(express.json());

let docstore = new InMemoryStore();

const openSearchClient = new OSClient({
  node: `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`,
});

let embeddings;
if (EMBEDDING_PROVIDER === "gemini") {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required.");
  // *** THIS IS THE FIX ***
  // REMOVED the outputDimension parameter.
  embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: GEMINI_API_KEY,
    modelName: GEMINI_EMBED_MODEL_NAME,
    taskType: "RETRIEVAL_DOCUMENT",
  });
  console.log(
    `[Init] Embedding Provider: Gemini, Model: ${GEMINI_EMBED_MODEL_NAME}`
  );
} else {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required.");
  embeddings = new OpenAIEmbeddings({
    apiKey: OPENAI_API_KEY,
    model: OPENAI_EMBED_MODEL_NAME,
  });
  console.log(
    `[Init] Embedding Provider: OpenAI, Model: ${OPENAI_EMBED_MODEL_NAME}`
  );
}

fs.ensureDirSync("./temp");
const upload = multer({ dest: "./temp" });

async function ensureIndexExists() {
  const exists = await openSearchClient.indices.exists({
    index: OPENSEARCH_INDEX_NAME,
  });
  if (!exists.body) {
    console.log(
      `[OpenSearch] Index "${OPENSEARCH_INDEX_NAME}" not found. Creating with dimension: ${EMBED_DIM}...`
    );
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
    console.log(`[OpenSearch] Index "${OPENSEARCH_INDEX_NAME}" created.`);
  }
}

app.post("/upload", upload.array("files"), async (req, res) => {
  const files = req.files;
  console.log(`[Upload] Received ${files.length} file(s)`);
  if (!files || files.length === 0)
    return res.status(400).json({ error: "No files uploaded." });

  try {
    await ensureIndexExists();
    const parentSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: PARENT_CHUNK_SIZE,
      chunkOverlap: PARENT_CHUNK_OVERLAP,
    });
    const childSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHILD_CHUNK_SIZE,
      chunkOverlap: CHILD_CHUNK_OVERLAP,
    });

    for (const file of files) {
      console.log(`[Processing] Starting: ${file.originalname}`);
      const loader = new (
        path.extname(file.originalname).toLowerCase() === ".pdf"
          ? PDFLoader
          : path.extname(file.originalname).toLowerCase() === ".docx"
          ? DocxLoader
          : TextLoader
      )(file.path);
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
      console.log(
        `[Success] Finished ${file.originalname}: ${parentChunks.length} parent chunks, ${childChunks.length} child chunks.`
      );
      await fs.unlink(file.path);
    }
    res.status(200).json({ success: true, message: "All files processed." });
  } catch (error) {
    console.error("[Upload] Critical error:", error);
    res.status(500).json({ error: "Error during upload." });
  }
});

app.post("/get-documents", async (req, res) => {
  const { ids } = req.body;
  console.log(`[get-documents] Request for ${ids?.length || 0} IDs.`);
  if (!ids || !Array.isArray(ids))
    return res.status(400).json({ error: "Invalid request body." });
  try {
    const documents = await docstore.mget(ids);
    console.log(
      `[get-documents] Found ${documents.filter((d) => d).length} documents.`
    );
    res.status(200).json({ documents });
  } catch (error) {
    console.error("[get-documents] Error:", error);
    res.status(500).json({ error: "Failed to retrieve documents." });
  }
});

app.post("/clear-docstore", (req, res) => {
  docstore = new InMemoryStore();
  console.log(`[Admin] In-memory docstore reset.`);
  res.status(200).send({ message: "Document store cleared." });
});

app.get("/health", (req, res) => res.status(200).json({ status: "healthy" }));

app.listen(EMBEDDING_SERVICE_PORT, async () => {
  console.log(`Embedding Service running on port ${EMBEDDING_SERVICE_PORT}`);
  await ensureIndexExists();
});
