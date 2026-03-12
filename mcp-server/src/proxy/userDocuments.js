// mcp-server/src/proxy/userDocuments.js
// GET /api/user-documents — Aggregates documents from OpenSearch for the authenticated user.

const express = require("express");
const axios = require("axios");
const authMiddleware = require("../authMiddleware");
const { OPENSEARCH_HOST, OPENSEARCH_PORT, OPENSEARCH_INDEX_NAME } = require("../config");
const logger = require("../logger");

const router = express.Router();

router.get("/api/user-documents", authMiddleware, async (req, res) => {
  const userId = req.userId;

  logger.info(`[User Documents] Fetching documents for user: ${userId}`);

  try {
    const userFilter = {
      bool: {
        should: [
          { term: { "metadata.userId.keyword": userId } },
          { term: { "metadata.userId": userId } },
          { match_phrase: { "metadata.userId": userId } },
        ],
        minimum_should_match: 1,
      },
    };

    const openSearchQuery = {
      size: Number(process.env.DOCUMENT_LIST_SAMPLE_SIZE) || 10000,
      track_total_hits: true,
      _source: ["metadata"],
      query: { bool: { filter: [userFilter] } },
    };

    const openSearchUrl = `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`;
    const indexName = OPENSEARCH_INDEX_NAME;

    const response = await axios.post(
      `${openSearchUrl}/${indexName}/_search`,
      openSearchQuery,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      }
    );

    const hits = response.data?.hits?.hits || [];
    logger.info(
      `[User Documents] OpenSearch returned total: ${
        response.data?.hits?.total?.value ?? hits.length
      }, windowed: ${hits.length}`
    );

    const groups = new Map();
    for (const h of hits) {
      const md = h._source?.metadata || {};
      const source = md.source || md.originalFilename || "Unknown";
      if (!groups.has(source)) {
        groups.set(source, {
          name:
            md.originalFilename ||
            (md.source ? md.source.split("/").pop() : "Unknown Document"),
          source: md.source || md.originalFilename || "Unknown",
          uploadedAt: md.uploadedAt || new Date(0).toISOString(),
          chunkCount: 0,
        });
      }
      const g = groups.get(source);
      g.chunkCount += 1;
      if (md.uploadedAt) {
        const a = new Date(g.uploadedAt).getTime();
        const b = new Date(md.uploadedAt).getTime();
        if (isFinite(b) && (!isFinite(a) || b > a)) {
          g.uploadedAt = md.uploadedAt;
        }
      }
    }

    const documents = Array.from(groups.values());
    logger.info(
      `[User Documents] Found ${documents.length} documents for user ${userId}`
    );
    res.json({ documents });
  } catch (error) {
    logger.error("[User Documents] Error fetching documents:", error);
    res.status(500).json({
      error: "Failed to fetch user documents",
      details: error.message,
    });
  }
});

module.exports = router;
