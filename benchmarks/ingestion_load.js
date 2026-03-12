/**
 * benchmarks/ingestion_load.js
 * ============================
 * k6 load test for the RASS /upload (ingestion) endpoint.
 * Measures document upload throughput and queue behaviour under concurrent load.
 *
 * Usage:
 *   k6 run benchmarks/ingestion_load.js
 *   k6 run --out json=benchmarks/results/ingestion_$(date +%s).json benchmarks/ingestion_load.js
 *
 * Environment variables:
 *   BASE_URL      — embedding-service base URL (default: http://localhost:8001)
 *   USER_ID       — userId to associate with uploaded documents
 *
 * Thresholds:
 *   p95 upload duration < 10 s
 *   error rate < 1 %
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";

// ── Custom metrics ─────────────────────────────────────────────────────────────
const uploadDuration = new Trend("rass_upload_duration_ms", true);
const errorRate = new Rate("rass_upload_error_rate");
const uploadsTotal = new Counter("rass_uploads_total");
const bytesUploaded = new Counter("rass_bytes_uploaded");

// ── Config ─────────────────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || "http://localhost:8001";
const USER_ID = __ENV.USER_ID || "benchmark-user";

// ── Scenarios ──────────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    concurrent_uploads: {
      executor: "constant-vus",
      vus: 10,
      duration: "3m",
      tags: { scenario: "concurrent_uploads" },
    },
  },
  thresholds: {
    // Upload p95 under 10 seconds (parsing + queueing, not full ingestion)
    http_req_duration: ["p(95)<10000"],
    // Error rate under 1 %
    http_req_failed: ["rate<0.01"],
    // Custom
    rass_upload_duration_ms: ["p(95)<10000"],
    rass_upload_error_rate: ["rate<0.01"],
  },
};

// ── Synthetic document content ─────────────────────────────────────────────────
// Generate a synthetic text document of approximately the given size.
function generateSyntheticDoc(sizeKb) {
  const paragraph =
    "This is a synthetic benchmark document generated for load testing the RASS ingestion pipeline. " +
    "It contains realistic prose text to simulate actual document content and measure throughput accurately. " +
    "The document covers topics such as machine learning, natural language processing, and information retrieval. " +
    "RAG (Retrieval-Augmented Generation) systems combine dense vector search with large language models to " +
    "produce grounded, factual answers from a curated knowledge base.\n\n";

  const targetBytes = sizeKb * 1024;
  let content = "";
  while (content.length < targetBytes) {
    content += paragraph;
  }
  return content.substring(0, targetBytes);
}

// Pre-generate document sizes (1 KB, 10 KB, 100 KB)
const DOCUMENT_SIZES_KB = [1, 10, 100];

// ── Default function ────────────────────────────────────────────────────────────
export default function () {
  const sizeKb = DOCUMENT_SIZES_KB[Math.floor(Math.random() * DOCUMENT_SIZES_KB.length)];
  const docContent = generateSyntheticDoc(sizeKb);
  const filename = `benchmark-doc-${sizeKb}kb-${Date.now()}.txt`;

  // Build multipart form
  const formData = {
    file: http.file(docContent, filename, "text/plain"),
    userId: USER_ID,
  };

  const startTime = Date.now();
  const res = http.post(`${BASE_URL}/upload`, formData, {
    timeout: "60s",
    tags: { endpoint: "upload", sizeKb: String(sizeKb) },
  });
  const duration = Date.now() - startTime;

  // Record metrics
  uploadDuration.add(duration);
  uploadsTotal.add(1);
  bytesUploaded.add(sizeKb * 1024);

  const success = check(res, {
    "status is 202": (r) => r.status === 202,
    "response has jobId": (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!body.jobId;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);

  // Brief think time between uploads
  sleep(Math.random() * 1 + 0.5);
}

// ── Setup / Teardown ───────────────────────────────────────────────────────────
export function setup() {
  console.log(`[k6] Starting ingestion load test against ${BASE_URL}`);
  console.log(`[k6] User ID: ${USER_ID}`);

  // Health check
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(
      `Embedding service not reachable at ${BASE_URL} (status: ${res.status})`
    );
  }
  console.log("[k6] Health check passed. Starting ingestion test...");
}

export function teardown(data) {
  console.log("[k6] Ingestion load test complete.");
}
