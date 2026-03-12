// mcp-server/src/middleware/correlationId.js
// Attaches a correlation ID to every inbound request and propagates it to
// downstream services via the x-correlation-id header.
// The correlation ID is sourced from the incoming header (for propagated traces)
// or generated as a new UUID if absent.

"use strict";

const { v4: uuidv4 } = require("uuid");
const logger = require("../logger");

/**
 * Express middleware that:
 *   1. Reads or generates a correlation ID.
 *   2. Attaches it to req.correlationId.
 *   3. Sets the x-correlation-id response header.
 *   4. Attaches a child pino logger to req.log with correlationId + userId context.
 */
function correlationIdMiddleware(req, res, next) {
  const correlationId = req.headers["x-correlation-id"] || uuidv4();
  req.correlationId = correlationId;
  res.setHeader("x-correlation-id", correlationId);

  // Child logger bound to this request's context
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
