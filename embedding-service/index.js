// embedding-service/index.js
// Thin orchestrator: initializes dependencies, starts the ingestion worker,
// registers routes, and binds the server.
// Dependencies (Redis docstore, OpenSearch index) are ready before any request is served.

const express = require("express");
const cors = require("cors");

const { EMBEDDING_SERVICE_PORT } = require("./src/config");
const { initializeDocstore } = require("./src/clients/redisClient");
const { ensureIndexExists } = require("./src/clients/opensearchClient");
const { createIngestionWorker } = require("./src/workers/ingestionWorker");
const { ingestionQueue } = require("./src/queue/ingestionQueue");

const uploadRoutes = require("./src/routes/upload");
const documentRoutes = require("./src/routes/documents");
const adminRoutes = require("./src/routes/admin");
const healthRoutes = require("./src/routes/health");
const ingestStatusRoutes = require("./src/routes/ingestStatus");

const app = express();
app.use(cors());
app.use(express.json());

app.use(uploadRoutes);
app.use(documentRoutes);
app.use(adminRoutes);
app.use(healthRoutes);
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
    console.log("[Init] Bull Board available at /admin/queues");
  } catch (e) {
    console.warn("[Init] Bull Board not available:", e.message);
  }
}

async function startServer() {
  try {
    await initializeDocstore();
    await ensureIndexExists();

    // Start the async ingestion worker
    createIngestionWorker();

    app.listen(EMBEDDING_SERVICE_PORT, () => {
      console.log(`Embedding Service running on port ${EMBEDDING_SERVICE_PORT}`);
      console.log("[Init] Embedding Service fully initialized and ready");
    });
  } catch (err) {
    console.error("[Fatal] Service initialization failed:", err);
    process.exit(1);
  }
}

startServer();
