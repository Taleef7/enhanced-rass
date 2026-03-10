const Redis = require("ioredis");
const { InMemoryStore } = require("langchain/storage/in_memory");

function createRedisClient(redisConfig) {
  const client = new Redis({
    host: redisConfig.host,
    port: redisConfig.port,
    db: redisConfig.db,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    connectTimeout: 10000,
    enableOfflineQueue: true,
    retryCount: 5,
    retryDelayOnClusterDown: 300,
  });

  client.on("connect", () => {
    console.log("[Redis] Connected successfully");
  });

  client.on("error", (err) => {
    console.error("[Redis] Connection error:", err);
  });

  client.on("ready", () => {
    console.log("[Redis] Ready to accept commands");
  });

  return client;
}

function setupGracefulShutdown(redisClient) {
  const shutdownHandler = async (signal) => {
    console.log(`[Shutdown] ${signal} received, shutting down gracefully...`);
    try {
      if (redisClient.status === "ready") {
        await redisClient.quit();
        console.log("[Shutdown] Redis connection closed.");
      }
    } catch (error) {
      console.error("[Shutdown] Error closing Redis connection:", error);
    }
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdownHandler("SIGTERM"));
  process.on("SIGINT", () => shutdownHandler("SIGINT"));
}

async function waitForRedis(redisClient, timeout = 15000) {
  if (redisClient.status === "ready") {
    return;
  }

  console.log("[Init] Waiting for Redis connection...");

  await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Redis connection timeout"));
    }, timeout);

    if (redisClient.status === "ready") {
      clearTimeout(timeoutId);
      resolve();
    } else {
      redisClient.once("ready", () => {
        clearTimeout(timeoutId);
        resolve();
      });

      redisClient.once("error", (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
    }
  });

  await redisClient.ping();
}

module.exports = {
  createRedisClient,
  setupGracefulShutdown,
  waitForRedis,
};
