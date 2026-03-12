// rass-engine-service/index.js
// Thin orchestrator: loads modules, registers routes, and starts the server.

// OpenTelemetry must be initialized FIRST (before any other imports)
require("./src/otel");

const express = require("express");
const { RASS_ENGINE_PORT } = require("./src/config");
const logger = require("./src/logger");
const { correlationIdMiddleware } = require("./src/middleware/correlationId");
const { metricsMiddleware } = require("./src/middleware/metricsMiddleware");
const metricsRoutes = require("./src/routes/metrics");

const askRoutes = require("./src/routes/ask");
const streamAskRoutes = require("./src/routes/streamAsk");

const app = express();
app.use(express.json());
app.use(correlationIdMiddleware);
app.use(metricsMiddleware("rass-engine-service"));

// Prometheus metrics endpoint
app.use(metricsRoutes);

app.use(askRoutes);
app.use(streamAskRoutes);

async function startServer() {
  app.listen(RASS_ENGINE_PORT, () =>
    logger.info(`RASS Engine API running on http://localhost:${RASS_ENGINE_PORT}`)
  );
}

startServer();
