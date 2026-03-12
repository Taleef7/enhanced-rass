// mcp-server/src/metrics.js
// Prometheus metrics definitions for mcp-server.
// Exposes a /metrics endpoint in Prometheus text format.
// Access is secured via METRICS_TOKEN env var (Authorization: Bearer <token>).

"use strict";

const client = require("prom-client");

// Enable default Node.js metrics (event loop lag, GC, heap, etc.)
const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: "rass_mcp_" });

// ── Counters ────────────────────────────────────────────────────────────────
const requestsTotal = new client.Counter({
  name: "rass_requests_total",
  help: "Total HTTP requests handled by mcp-server",
  labelNames: ["service", "route", "status"],
  registers: [register],
});

const llmApiErrorsTotal = new client.Counter({
  name: "rass_llm_api_errors_total",
  help: "Total LLM API errors",
  labelNames: ["provider"],
  registers: [register],
});

const authFailuresTotal = new client.Counter({
  name: "rass_auth_failures_total",
  help: "Total authentication failures",
  labelNames: ["reason"],
  registers: [register],
});

// ── Histograms ──────────────────────────────────────────────────────────────
const queryLatencySeconds = new client.Histogram({
  name: "rass_query_latency_seconds",
  help: "Query end-to-end latency in seconds",
  labelNames: ["stage"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: "rass_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["service", "route", "method", "status"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

module.exports = {
  register,
  requestsTotal,
  llmApiErrorsTotal,
  authFailuresTotal,
  queryLatencySeconds,
  httpRequestDurationSeconds,
};
