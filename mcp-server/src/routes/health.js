// mcp-server/src/routes/health.js
// Phase F: Comprehensive health check endpoint.
//
// Routes:
//   GET /api/health — Returns service health for all dependencies

"use strict";

const express = require("express");
const axios = require("axios");
const { prisma } = require("../prisma");
const {
  OPENSEARCH_HOST,
  OPENSEARCH_PORT,
  EMBEDDING_SERVICE_BASE_URL,
  RASS_ENGINE_BASE_URL,
} = require("../config");
const logger = require("../logger");

const router = express.Router();

// ── GET /api/health ───────────────────────────────────────────────────────────

router.get("/api/health", async (req, res) => {
  const checks = {};
  let allHealthy = true;

  // --- Postgres/Prisma check ---
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.postgres = { status: "ok" };
  } catch (err) {
    checks.postgres = { status: "error", message: err.message };
    allHealthy = false;
  }

  // --- OpenSearch check ---
  try {
    const osUrl = `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}/_cluster/health`;
    const osRes = await axios.get(osUrl, { timeout: 3000 });
    checks.opensearch = {
      status: osRes.data.status === "red" ? "error" : "ok",
      clusterStatus: osRes.data.status,
    };
    if (osRes.data.status === "red") allHealthy = false;
  } catch (err) {
    checks.opensearch = { status: "error", message: err.message };
    allHealthy = false;
  }

  // --- Redis/BullMQ check via embedding-service ---
  try {
    const embRes = await axios.get(`${EMBEDDING_SERVICE_BASE_URL}/health`, {
      timeout: 3000,
    });
    const embStatus = embRes.data?.status;
    checks.embeddingService = {
      status: embStatus === "ok" || embStatus === "healthy" ? "ok" : "degraded",
    };
    if (embRes.data?.redis) checks.redis = embRes.data.redis;
  } catch (err) {
    checks.embeddingService = { status: "error", message: err.message };
    allHealthy = false;
  }

  // --- RASS Engine check ---
  try {
    const engRes = await axios.get(`${RASS_ENGINE_BASE_URL}/health`, {
      timeout: 3000,
    });
    const engStatus = engRes.data?.status;
    checks.rassEngine = {
      status: engStatus === "ok" || engStatus === "healthy" ? "ok" : "degraded",
    };
  } catch (err) {
    checks.rassEngine = { status: "error", message: err.message };
    allHealthy = false;
  }

  const httpStatus = allHealthy ? 200 : 503;
  res.status(httpStatus).json({
    status: allHealthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    services: checks,
  });
});

module.exports = router;
