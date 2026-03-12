// mcp-server/index.js
// Thin orchestrator: loads modules, registers routes and middleware, and starts the server.

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

const logger = require("./src/logger");
const { correlationIdMiddleware } = require("./src/middleware/correlationId");
const { MCP_SERVER_PORT } = require("./src/config");

// Existing extracted routes (unchanged)
const authRoutes = require("./src/authRoutes.js");
const chatRoutes = require("./src/chatRoutes.js");

// Proxy handlers
const embedUploadRoutes = require("./src/proxy/embedUpload.js");
const streamAskRoutes = require("./src/proxy/streamAsk.js");
const chatCompletionsRoutes = require("./src/proxy/chatCompletions.js");
const userDocumentsRoutes = require("./src/proxy/userDocuments.js");
const transcribeRoutes = require("./src/proxy/transcribe.js");
const ingestStatusRoutes = require("./src/proxy/ingestStatus.js");

// Gateway handlers
const mcpTransportRoutes = require("./src/gateway/mcpTransport.js");

// Phase B routes
const documentRoutes = require("./src/routes/documents.js");
const knowledgeBaseRoutes = require("./src/routes/knowledgeBases.js");
const internalServiceRoutes = require("./src/routes/internalService.js");

// Phase D routes
const workspaceRoutes = require("./src/routes/workspaces.js");
const apiKeyRoutes = require("./src/routes/apiKeys.js");
const adminRoutes = require("./src/routes/admin.js");

const app = express();
app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
}));
// Cookie parser is used for the HTTP-only refresh token cookie.
// CSRF mitigation: refresh token cookies are set with SameSite=Strict, preventing
// cross-site requests. All other endpoints use Authorization Bearer/ApiKey headers
// (not susceptible to CSRF). No additional CSRF middleware is required for this
// API-first architecture.
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(correlationIdMiddleware);

// --- Swagger UI (non-production only) ---
if (process.env.NODE_ENV !== "production") {
  const swaggerUi = require("swagger-ui-express");
  const YAML = require("js-yaml");
  const fs = require("fs");
  try {
    const openApiSpec = YAML.load(
      fs.readFileSync(path.join(__dirname, "openapi.yaml"), "utf8")
    );
    app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
    logger.info("[API Docs] Swagger UI available at /api/docs");
  } catch (e) {
    logger.warn("[API Docs] Failed to load openapi.yaml:", e.message);
  }
}

// --- Proxy routes ---
app.use(chatCompletionsRoutes);
app.use(embedUploadRoutes);
app.use(transcribeRoutes);
app.use(streamAskRoutes);
app.use(userDocumentsRoutes);
app.use(ingestStatusRoutes);

// --- Phase B: Internal service routes (service-to-service, no JWT) ---
app.use(internalServiceRoutes);

// --- Phase B: Document registry API ---
app.use(documentRoutes);

// --- Phase B: Knowledge Base management API ---
app.use(knowledgeBaseRoutes);

// --- Phase D: Multi-tenant workspaces ---
app.use(workspaceRoutes);

// --- Phase D: API key management ---
app.use(apiKeyRoutes);

// --- Phase D: Admin / compliance / audit reporting ---
app.use(adminRoutes);

// --- Legacy simple-ask (deprecated) ---
// @deprecated Use /api/stream-ask instead.
const axios = require("axios");
app.post("/simple-ask", async (req, res) => {
  const { query, top_k } = req.body;
  logger.info(`[REST /simple-ask] Received query: "${query}"`);
  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }
  try {
    const rassEngineUrl = "http://rass-engine-service:8000/ask";
    const response = await axios.post(rassEngineUrl, { query, top_k });
    res.status(200).json(response.data);
  } catch (e) {
    logger.error("[REST /simple-ask] Error calling RASS engine:", e.message);
    res.status(500).json({ error: "Failed to process query in RASS engine." });
  }
});

// --- MCP transport ---
app.use(mcpTransportRoutes);

// --- Auth routes ---
app.use("/api/auth", authRoutes);

// --- Chat routes ---
app.use("/api/chats", chatRoutes);

// --- Health check ---
app.get("/", (req, res) => {
  res.status(200).send("RASS MCP Server is running.");
});

app.listen(MCP_SERVER_PORT, () => {
  logger.info(`MCP Server listening on http://localhost:${MCP_SERVER_PORT}`);
});

// --- Phase D: Schedule nightly retention sweep ---
const { runRetentionSweep } = require("./src/services/PurgeService");
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
setInterval(() => {
  logger.info("[RetentionSweep] Running scheduled retention sweep...");
  runRetentionSweep().catch((err) =>
    logger.error("[RetentionSweep] Error:", err.message)
  );
}, SWEEP_INTERVAL_MS);
logger.info("[RetentionSweep] Nightly retention sweep scheduled (every 24h).");
