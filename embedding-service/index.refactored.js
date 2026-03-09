const express = require("express");
const multer = require("multer");
const fs = require("fs-extra");
const cors = require("cors");

// Config
const { loadConfig } = require("./src/config");
const config = loadConfig();

// Clients
const {
  createRedisClient,
  setupGracefulShutdown,
  waitForRedis,
} = require("./src/clients/redisClient");
const { createEmbeddingsProvider } = require("./src/clients/embedder");
const {
  createOpenSearchClient,
  ensureIndexExists,
} = require("./src/clients/opensearchClient");

// Store
const { RedisDocumentStore } = require("./src/store/redisDocumentStore");

// Routes
const { handleUpload } = require("./src/routes/upload");
const { handleGetDocuments } = require("./src/routes/documents");
const { handleClearDocstore } = require("./src/routes/admin");
const { handleHealth } = require("./src/routes/health");

const app = express();
app.use(cors());
app.use(express.json());

// Initialize clients
const redisClient = createRedisClient(config.redis);
const openSearchClient = createOpenSearchClient(config.opensearch);
const embeddings = createEmbeddingsProvider(config);

// Setup graceful shutdown
setupGracefulShutdown(redisClient);

// Initialize docstore
let docstore;

async function initializeDocstore() {
  try {
    await waitForRedis(redisClient);
    await redisClient.ping();

    docstore = new RedisDocumentStore(redisClient);
    console.log("[Init] Redis-backed document store initialized successfully");
    return docstore;
  } catch (error) {
    console.error(
      "[Init] Failed to initialize Redis docstore, falling back to InMemoryStore:",
      error
    );
    const { InMemoryStore } = require("langchain/storage/in_memory");
    docstore = new InMemoryStore();
    console.log("[Init] Using InMemoryStore as fallback");
    return docstore;
  }
}

// Setup multer
fs.ensureDirSync("./temp");
const upload = multer({ dest: "./temp" });

// Dependencies object for route handlers
const dependencies = {
  docstore,
  embeddings,
  openSearchClient,
  redisClient,
  config,
};

// Register routes
app.post("/upload", upload.array("files"), (req, res) =>
  handleUpload(req, res, dependencies)
);

app.post("/get-documents", (req, res) =>
  handleGetDocuments(req, res, dependencies)
);

app.post("/clear-docstore", (req, res) =>
  handleClearDocstore(req, res, dependencies)
);

app.get("/docstore/stats", async (req, res) => {
  try {
    if (docstore instanceof RedisDocumentStore) {
      const allKeys = await docstore.yieldKeys("");
      res.status(200).json({
        type: "redis",
        totalDocuments: allKeys.length,
        sampleKeys: allKeys.slice(0, 5),
        redisStatus: redisClient.status,
      });
    } else {
      res.status(200).json({
        type: "inmemory",
        message: "InMemoryStore stats not available",
      });
    }
  } catch (error) {
    console.error("[DocStore Stats] Error:", error);
    res.status(500).json({ error: "Failed to get docstore stats." });
  }
});

app.get("/health", (req, res) => handleHealth(req, res, dependencies));

// Start server
app.listen(config.service.port, async () => {
  console.log(`Embedding Service running on port ${config.service.port}`);

  await initializeDocstore();
  await ensureIndexExists(
    openSearchClient,
    config.opensearch.indexName,
    config.opensearch.embedDim
  );

  console.log("[Init] Embedding Service fully initialized and ready");
});
