const { RedisDocumentStore } = require("../store/redisDocumentStore");

async function handleHealth(req, res, dependencies) {
  const { docstore, openSearchClient, redisClient } = dependencies;

  try {
    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        docstore: "unknown",
        opensearch: "unknown",
      },
    };

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
}

module.exports = { handleHealth };
