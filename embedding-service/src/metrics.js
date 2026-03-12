// embedding-service/src/metrics.js
// Prometheus metrics definitions for embedding-service.
// Exposes a /metrics endpoint in Prometheus text format.

"use strict";

const client = require("prom-client");

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: "rass_embedding_" });

// ── Counters ────────────────────────────────────────────────────────────────
const requestsTotal = new client.Counter({
  name: "rass_requests_total",
  help: "Total HTTP requests handled",
  labelNames: ["service", "route", "status"],
  registers: [register],
});

// ── Histograms ──────────────────────────────────────────────────────────────
const ingestionDurationSeconds = new client.Histogram({
  name: "rass_ingestion_duration_seconds",
  help: "Ingestion pipeline stage duration in seconds",
  labelNames: ["stage"],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: "rass_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["service", "route", "method", "status"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

// ── Gauges ──────────────────────────────────────────────────────────────────
const ingestionQueueDepth = new client.Gauge({
  name: "rass_ingestion_queue_depth",
  help: "Current depth of the ingestion BullMQ queue",
  labelNames: ["queue"],
  registers: [register],
});

const activeWorkers = new client.Gauge({
  name: "rass_ingestion_active_workers",
  help: "Number of currently active ingestion worker threads",
  registers: [register],
});

module.exports = {
  register,
  requestsTotal,
  ingestionDurationSeconds,
  httpRequestDurationSeconds,
  ingestionQueueDepth,
  activeWorkers,
};
