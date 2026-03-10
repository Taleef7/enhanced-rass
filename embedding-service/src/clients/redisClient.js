// embedding-service/src/clients/redisClient.js
// Redis client setup with retry logic, graceful shutdown, and docstore management.

const Redis = require("ioredis");
const { InMemoryStore } = require("langchain/storage/in_memory");
const { RedisDocumentStore } = require("../store/redisDocumentStore");
const {
  REDIS_HOST,
  REDIS_PORT,
  REDIS_DB,
} = require("../config");

const redisClient = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  db: REDIS_DB,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: false,
  connectTimeout: 10000,
  enableOfflineQueue: true,
  retryCount: 5,
  retryDelayOnClusterDown: 300,
});

redisClient.on("connect", () => {
  console.log("[Redis] Connected successfully");
});

redisClient.on("error", (err) => {
  console.error("[Redis] Connection error:", err);
});

redisClient.on("ready", () => {
  console.log("[Redis] Ready to accept commands");
});

// Module-level docstore reference shared across routes
let docstore = null;

function getDocstore() {
  return docstore;
}

function setDocstore(store) {
  docstore = store;
}

// Graceful shutdown handlers
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

async function initializeDocstore() {
  try {
    if (redisClient.status !== "ready") {
      console.log("[Init] Waiting for Redis connection...");

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Redis connection timeout"));
        }, 15000);

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

module.exports = {
  redisClient,
  initializeDocstore,
  getDocstore,
  setDocstore,
};
