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
const healthRoutes = require("./src/routes/health");

const askRoutes = require("./src/routes/ask");
const generateRoutes = require("./src/routes/generate");
const streamAskRoutes = require("./src/routes/streamAsk");

const app = express();

// Security headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "0");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  next();
});

app.use(express.json());
app.use(correlationIdMiddleware);
app.use(metricsMiddleware("rass-engine-service"));

// Prometheus metrics endpoint
app.use(metricsRoutes);
app.use(healthRoutes);

app.use(askRoutes);
app.use(generateRoutes);
app.use(streamAskRoutes);

async function startServer() {
  app.listen(RASS_ENGINE_PORT, () =>
    logger.info(`RASS Engine API running on http://localhost:${RASS_ENGINE_PORT}`)
  );
}

startServer();
