// embedding-service/index.js
// Thin orchestrator: initializes dependencies, starts the ingestion worker,
// registers routes, and binds the server.
// Dependencies (Redis docstore, OpenSearch index) are ready before any request is served.

// OpenTelemetry must be initialized FIRST (before any other imports)
require("./src/otel");

const express = require("express");
const cors = require("cors");

const logger = require("./src/logger");
const { correlationIdMiddleware } = require("./src/middleware/correlationId");
const { metricsMiddleware } = require("./src/middleware/metricsMiddleware");
const { EMBEDDING_SERVICE_PORT } = require("./src/config");
const { initializeDocstore } = require("./src/clients/redisClient");
const { ensureIndexExists } = require("./src/clients/opensearchClient");
const { createIngestionWorker } = require("./src/workers/ingestionWorker");
const { ingestionQueue } = require("./src/queue/ingestionQueue");

const uploadRoutes = require("./src/routes/upload");
const documentRoutes = require("./src/routes/documents");
const adminRoutes = require("./src/routes/admin");
const healthRoutes = require("./src/routes/health");
const metricsRoutes = require("./src/routes/metrics");
const ingestStatusRoutes = require("./src/routes/ingestStatus");

const app = express();
app.use(cors());
app.use(express.json());
app.use(correlationIdMiddleware);
app.use(metricsMiddleware("embedding-service"));

app.use(uploadRoutes);
app.use(documentRoutes);
app.use(adminRoutes);
app.use(healthRoutes);
app.use(metricsRoutes);
app.use(ingestStatusRoutes);

// --- Bull Board (queue dashboard, dev only) ---
if (process.env.NODE_ENV !== "production") {
  try {
    const { createBullBoard } = require("@bull-board/api");
    const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");
    const { ExpressAdapter } = require("@bull-board/express");

    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath("/admin/queues");

    createBullBoard({
      queues: [new BullMQAdapter(ingestionQueue)],
      serverAdapter,
    });

    app.use("/admin/queues", serverAdapter.getRouter());
    logger.info("[Init] Bull Board available at /admin/queues");
  } catch (e) {
    logger.warn("[Init] Bull Board not available:", e.message);
  }
}

async function startServer() {
  try {
    await initializeDocstore();
    await ensureIndexExists();

    // Start the async ingestion worker
    createIngestionWorker();

    app.listen(EMBEDDING_SERVICE_PORT, () => {
      logger.info(`Embedding Service running on port ${EMBEDDING_SERVICE_PORT}`);
      logger.info("[Init] Embedding Service fully initialized and ready");
    });
  } catch (err) {
    logger.error("[Fatal] Service initialization failed:", err);
    process.exit(1);
  }
}

startServer();
