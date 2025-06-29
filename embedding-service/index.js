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
const { BaseStore } = require("@langchain/core/stores");
const { OpenAIEmbeddings } = require("@langchain/openai");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const {
  OpenSearchVectorStore,
} = require("@langchain/community/vectorstores/opensearch");
const { Client: OSClient } = require("@opensearch-project/opensearch");
const Redis = require("ioredis");

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
  REDIS_HOST,
  REDIS_PORT,
  REDIS_DB,
} = config;
// --- End Configuration Loading ---

const app = express();
app.use(cors());
app.use(express.json());

// Custom Redis-based document store
class RedisDocumentStore extends BaseStore {
  constructor(redisClient, keyPrefix = "docstore:") {
    super();
    this.redis = redisClient;
    this.keyPrefix = keyPrefix;
    console.log("[RedisDocumentStore] Initialized with prefix:", keyPrefix);
  }

  async mget(keys) {
    try {
      const prefixedKeys = keys.map((key) => `${this.keyPrefix}${key}`);
      const values = await this.redis.mget(...prefixedKeys);

      const results = values.map((value, index) => {
        if (value === null) {
          console.warn(`[RedisDocumentStore] Key not found: ${keys[index]}`);
          return null;
        }
        try {
          return JSON.parse(value);
        } catch (error) {
          console.error(
            `[RedisDocumentStore] Failed to parse value for key ${keys[index]}:`,
            error
          );
          return null;
        }
      });

      console.log(
        `[RedisDocumentStore] Retrieved ${
          results.filter((r) => r !== null).length
        }/${keys.length} documents`
      );
      return results;
    } catch (error) {
      console.error("[RedisDocumentStore] Error in mget:", error);
      throw error;
    }
  }

  async mset(keyValuePairs) {
    try {
      const pipeline = this.redis.pipeline();

      for (const [key, value] of keyValuePairs) {
        const prefixedKey = `${this.keyPrefix}${key}`;
        const serializedValue = JSON.stringify(value);
        pipeline.set(prefixedKey, serializedValue);
      }

      await pipeline.exec();
      console.log(
        `[RedisDocumentStore] Stored ${keyValuePairs.length} documents`
      );
    } catch (error) {
      console.error("[RedisDocumentStore] Error in mset:", error);
      throw error;
    }
  }

  async mdelete(keys) {
    try {
      const prefixedKeys = keys.map((key) => `${this.keyPrefix}${key}`);
      const result = await this.redis.del(...prefixedKeys);
      console.log(`[RedisDocumentStore] Deleted ${result} documents`);
      return result;
    } catch (error) {
      console.error("[RedisDocumentStore] Error in mdelete:", error);
      throw error;
    }
  }

  async yieldKeys(prefix) {
    try {
      const pattern = `${this.keyPrefix}${prefix || ""}*`;
      const keys = await this.redis.keys(pattern);
      return keys.map((key) => key.replace(this.keyPrefix, ""));
    } catch (error) {
      console.error("[RedisDocumentStore] Error in yieldKeys:", error);
      throw error;
    }
  }
}

// Initialize Redis client
const redisClient = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  db: REDIS_DB,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: false, // Connect immediately
  connectTimeout: 10000,
  enableOfflineQueue: true, // Allow queueing commands when not connected
  retryCount: 5,
  retryDelayOnClusterDown: 300,
});

// Event handlers for Redis connection
redisClient.on("connect", () => {
  console.log("[Redis] Connected successfully");
});

redisClient.on("error", (err) => {
  console.error("[Redis] Connection error:", err);
});

redisClient.on("ready", () => {
  console.log("[Redis] Ready to accept commands");
});

// Graceful shutdown handler
process.on("SIGTERM", async () => {
  console.log("[Shutdown] SIGTERM received, shutting down gracefully...");
  try {
    if (redisClient.status === "ready") {
      await redisClient.quit();
      console.log("[Shutdown] Redis connection closed.");
    }
  } catch (error) {
    console.error("[Shutdown] Error closing Redis connection:", error);
  }
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Shutdown] SIGINT received, shutting down gracefully...");
  try {
    if (redisClient.status === "ready") {
      await redisClient.quit();
      console.log("[Shutdown] Redis connection closed.");
    }
  } catch (error) {
    console.error("[Shutdown] Error closing Redis connection:", error);
  }
  process.exit(0);
});

// Initialize the document store
let docstore;

async function initializeDocstore() {
  try {
    // Wait for Redis to be ready
    if (redisClient.status !== "ready") {
      console.log("[Init] Waiting for Redis connection...");

      // Wait for Redis to be ready with a timeout
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Redis connection timeout"));
        }, 15000); // 15 second timeout

        if (redisClient.status === "ready") {
          clearTimeout(timeout);
          resolve();
        } else {
          redisClient.once("ready", () => {
            clearTimeout(timeout);
            resolve();
          });

          redisClient.once("error", (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        }
      });
    }

    // Test the connection
    await redisClient.ping();

    docstore = new RedisDocumentStore(redisClient);
    console.log("[Init] Redis-backed document store initialized successfully");
    return docstore;
  } catch (error) {
    console.error(
      "[Init] Failed to initialize Redis docstore, falling back to InMemoryStore:",
      error
    );
    docstore = new InMemoryStore();
    console.log("[Init] Using InMemoryStore as fallback");
    return docstore;
  }
}

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

app.post("/clear-docstore", async (req, res) => {
  try {
    if (docstore instanceof RedisDocumentStore) {
      // For Redis store, clear all keys with our prefix
      const allKeys = await docstore.yieldKeys("");
      if (allKeys.length > 0) {
        await docstore.mdelete(allKeys);
        console.log(
          `[Admin] Redis docstore cleared: ${allKeys.length} documents deleted.`
        );
      } else {
        console.log(`[Admin] Redis docstore was already empty.`);
      }
    } else {
      // Fallback for InMemoryStore
      docstore = new InMemoryStore();
      console.log(`[Admin] In-memory docstore reset.`);
    }
    res.status(200).send({ message: "Document store cleared." });
  } catch (error) {
    console.error("[Admin] Error clearing docstore:", error);
    res.status(500).json({ error: "Failed to clear document store." });
  }
});

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
      // For InMemoryStore, we can't easily get stats, so return basic info
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

app.get("/health", async (req, res) => {
  try {
    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        docstore: "unknown",
        opensearch: "unknown",
      },
    };

    // Check docstore health
    if (docstore instanceof RedisDocumentStore) {
      try {
        await redisClient.ping();
        health.services.docstore = "redis-connected";
      } catch (error) {
        health.services.docstore = "redis-error";
        health.status = "degraded";
      }
    } else {
      health.services.docstore = "inmemory-fallback";
      health.status = "degraded";
    }

    // Check OpenSearch health (simple check)
    try {
      await openSearchClient.ping();
      health.services.opensearch = "connected";
    } catch (error) {
      health.services.opensearch = "error";
      health.status = "unhealthy";
    }

    const statusCode =
      health.status === "healthy"
        ? 200
        : health.status === "degraded"
        ? 200
        : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.listen(EMBEDDING_SERVICE_PORT, async () => {
  console.log(`Embedding Service running on port ${EMBEDDING_SERVICE_PORT}`);

  // Initialize the docstore (Redis or fallback to InMemory)
  await initializeDocstore();

  // Ensure OpenSearch index exists
  await ensureIndexExists();

  console.log("[Init] Embedding Service fully initialized and ready");
});
