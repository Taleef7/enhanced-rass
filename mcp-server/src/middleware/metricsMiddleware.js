// mcp-server/src/middleware/metricsMiddleware.js
// Records HTTP request duration and total count in Prometheus on each request.

"use strict";

const { requestsTotal, httpRequestDurationSeconds } = require("../metrics");

function metricsMiddleware(serviceName) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const durationNs = process.hrtime.bigint() - start;
      const durationSec = Number(durationNs) / 1e9;
      const route = req.route?.path || req.path || "unknown";
      const status = String(res.statusCode);

      requestsTotal.inc({ service: serviceName, route, status });
      httpRequestDurationSeconds.observe(
        { service: serviceName, route, method: req.method, status },
        durationSec
      );
    });
    next();
  };
}

module.exports = { metricsMiddleware };
