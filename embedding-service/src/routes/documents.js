// embedding-service/src/routes/documents.js
// POST /get-documents — Retrieves parent documents from the docstore by ID.
// GET  /docstore/stats — Returns docstore type and document count.

const express = require("express");
const { getDocstore, redisClient } = require("../clients/redisClient");
const { RedisDocumentStore } = require("../store/redisDocumentStore");

const router = express.Router();

router.post("/get-documents", async (req, res) => {
  const { ids } = req.body;
  console.log(`[get-documents] Request for ${ids?.length || 0} IDs.`);

  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: "Invalid request body." });
  }

  const docstore = getDocstore();
  if (!docstore) {
    return res.status(503).json({ error: "Document store is not initialized." });
  }

  try {
    const documents = await docstore.mget(ids);
    console.log(
      `[get-documents] Found ${documents.filter((d) => d).length} documents.`
    );
    res.status(200).json({ documents });
  } catch (error) {
    console.error("[get-documents] Error:", error);
    res.status(500).json({ error: "Failed to retrieve documents." });
  }
});

router.get("/docstore/stats", async (req, res) => {
  const docstore = getDocstore();
  try {
    if (docstore instanceof RedisDocumentStore) {
      const allKeys = await docstore.yieldKeys("");
      res.status(200).json({
        type: "redis",
        totalDocuments: allKeys.length,
        sampleKeys: allKeys.slice(0, 5),
        redisStatus: redisClient.status,
      });
    } else {
      res.status(200).json({
        type: "inmemory",
        message: "InMemoryStore stats not available",
      });
    }
  } catch (error) {
    console.error("[DocStore Stats] Error:", error);
    res.status(500).json({ error: "Failed to get docstore stats." });
  }
});

module.exports = router;
