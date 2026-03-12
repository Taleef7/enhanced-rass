// rass-engine-service/src/metrics.js
// Prometheus metrics definitions for rass-engine-service.
// Exposes a /metrics endpoint in Prometheus text format.

"use strict";

const client = require("prom-client");

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: "rass_engine_" });

// ── Counters ────────────────────────────────────────────────────────────────
const requestsTotal = new client.Counter({
  name: "rass_requests_total",
  help: "Total HTTP requests handled",
  labelNames: ["service", "route", "status"],
  registers: [register],
});

// ── Histograms ──────────────────────────────────────────────────────────────
const queryLatencySeconds = new client.Histogram({
  name: "rass_query_latency_seconds",
  help: "Query latency in seconds, broken down by pipeline stage",
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

const opensearchQueryDurationSeconds = new client.Histogram({
  name: "rass_opensearch_query_duration_seconds",
  help: "OpenSearch query duration in seconds",
  labelNames: ["operation"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register],
});

module.exports = {
  register,
  requestsTotal,
  queryLatencySeconds,
  httpRequestDurationSeconds,
  opensearchQueryDurationSeconds,
};
