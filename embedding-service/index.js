// embedding-service/index.js
// Thin orchestrator: initializes dependencies, then binds the server.
// Dependencies (Redis docstore, OpenSearch index) are ready before any request is served.

const express = require("express");
const cors = require("cors");

const { EMBEDDING_SERVICE_PORT } = require("./src/config");
const { initializeDocstore } = require("./src/clients/redisClient");
const { ensureIndexExists } = require("./src/clients/opensearchClient");

const uploadRoutes = require("./src/routes/upload");
const documentRoutes = require("./src/routes/documents");
const adminRoutes = require("./src/routes/admin");
const healthRoutes = require("./src/routes/health");

const app = express();
app.use(cors());
app.use(express.json());

app.use(uploadRoutes);
app.use(documentRoutes);
app.use(adminRoutes);
app.use(healthRoutes);

async function startServer() {
  try {
    await initializeDocstore();
    await ensureIndexExists();
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
