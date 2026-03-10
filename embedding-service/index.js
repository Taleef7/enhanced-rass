// embedding-service/index.js
// Thin orchestrator: loads modules, registers routes, and starts the server.

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

app.listen(EMBEDDING_SERVICE_PORT, async () => {
  console.log(`Embedding Service running on port ${EMBEDDING_SERVICE_PORT}`);
  await initializeDocstore();
  await ensureIndexExists();
  console.log("[Init] Embedding Service fully initialized and ready");
});
