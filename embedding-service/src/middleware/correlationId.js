// embedding-service/src/middleware/correlationId.js
// Attaches a correlation ID to every inbound request.
// Reads x-correlation-id from the incoming header (forwarded by mcp-server)
// or generates a new UUID for standalone requests.

"use strict";

const { v4: uuidv4 } = require("uuid");
const logger = require("../logger");

function correlationIdMiddleware(req, res, next) {
  const correlationId = req.headers["x-correlation-id"] || uuidv4();
  req.correlationId = correlationId;
  res.setHeader("x-correlation-id", correlationId);

  req.log = logger.child({
    correlationId,
    method: req.method,
    path: req.path,
  });

  const start = Date.now();
  res.on("finish", () => {
    req.log.info({
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
    }, "request completed");
  });

  next();
}

module.exports = { correlationIdMiddleware };
