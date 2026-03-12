/**
 * benchmarks/query_load.js
 * ========================
 * k6 load test for the RASS /api/stream-ask endpoint.
 *
 * Usage:
 *   k6 run benchmarks/query_load.js
 *   k6 run --out json=benchmarks/results/query_$(date +%s).json benchmarks/query_load.js
 *
 * Environment variables:
 *   BASE_URL     — RASS mcp-server base URL (default: http://localhost:8080)
 *   AUTH_TOKEN   — JWT bearer token for authentication
 *
 * Scenarios:
 *   steady_state — 10 VUs for 2 minutes (sustained load baseline)
 *   ramp_up      — ramp from 1 → 50 VUs over 5 minutes (stress test)
 *
 * Thresholds:
 *   p95 request duration < 3 s
 *   error rate < 1 %
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";

// ── Custom metrics ─────────────────────────────────────────────────────────────
const queryDuration = new Trend("rass_query_duration_ms", true);
const errorRate = new Rate("rass_query_error_rate");
const queriesTotal = new Counter("rass_queries_total");

// ── Config ─────────────────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || "http://localhost:8080";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";

// Sample queries that represent realistic usage
const SAMPLE_QUERIES = [
  "What are the main topics covered in the uploaded documents?",
  "Summarize the key findings from the research papers.",
  "What is the methodology used in the study?",
  "Explain the conclusions and recommendations.",
  "What are the limitations mentioned in the document?",
  "Describe the data collection process.",
  "What are the main contributions of this work?",
  "Provide an overview of the related work section.",
  "What future work is suggested by the authors?",
  "What are the experimental results and their significance?",
];

// ── Scenarios ──────────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    steady_state: {
      executor: "constant-vus",
      vus: 10,
      duration: "2m",
      tags: { scenario: "steady_state" },
    },
    ramp_up: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { target: 10, duration: "1m" },
        { target: 30, duration: "2m" },
        { target: 50, duration: "2m" },
      ],
      startTime: "2m30s", // Start after steady_state finishes
      tags: { scenario: "ramp_up" },
    },
  },
  thresholds: {
    // 95th percentile response time must be under 3 seconds
    http_req_duration: ["p(95)<3000"],
    // Error rate must stay below 1 %
    http_req_failed: ["rate<0.01"],
    // Custom metric thresholds
    rass_query_duration_ms: ["p(95)<3000"],
    rass_query_error_rate: ["rate<0.01"],
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildHeaders() {
  const headers = {
    "Content-Type": "application/json",
  };
  if (AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
  }
  return headers;
}

// ── Default function (executed per VU iteration) ───────────────────────────────
export default function () {
  const query = pickRandom(SAMPLE_QUERIES);
  const payload = JSON.stringify({ query, top_k: 5 });
  const headers = buildHeaders();

  const startTime = Date.now();
  const res = http.post(`${BASE_URL}/api/stream-ask`, payload, {
    headers,
    timeout: "30s",
    tags: { endpoint: "stream-ask" },
  });
  const duration = Date.now() - startTime;

  // Record custom metrics
  queryDuration.add(duration);
  queriesTotal.add(1);

  const success = check(res, {
    "status is 200": (r) => r.status === 200,
    "response has content": (r) => r.body && r.body.length > 0,
    "no error in body": (r) => !r.body.includes('"error"'),
  });

  errorRate.add(!success);

  // Think time between requests (simulates real user behavior)
  sleep(Math.random() * 2 + 0.5);
}

// ── Setup / Teardown ───────────────────────────────────────────────────────────
export function setup() {
  console.log(`[k6] Starting query load test against ${BASE_URL}`);
  console.log(`[k6] Auth token: ${AUTH_TOKEN ? "set" : "not set (anonymous)"}`);

  // Health check before running
  const res = http.get(`${BASE_URL}/`);
  if (res.status !== 200) {
    throw new Error(`RASS MCP Server not reachable at ${BASE_URL} (status: ${res.status})`);
  }
  console.log("[k6] Health check passed. Starting load test...");
}

export function teardown() {
  console.log("[k6] Query load test complete.");
}
