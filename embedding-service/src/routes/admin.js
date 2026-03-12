// embedding-service/src/routes/admin.js
// POST /clear-docstore — Clears all documents from the active docstore.

const express = require("express");
const { InMemoryStore } = require("langchain/storage/in_memory");
const { getDocstore, setDocstore } = require("../clients/redisClient");
const { RedisDocumentStore } = require("../store/redisDocumentStore");
const logger = require("../logger");

const router = express.Router();

router.post("/clear-docstore", async (req, res) => {
  const docstore = getDocstore();

  if (!docstore) {
    return res.status(503).json({ error: "Document store is not initialized." });
  }

  try {
    if (docstore instanceof RedisDocumentStore) {
      const allKeys = await docstore.yieldKeys("");
      if (allKeys.length > 0) {
        await docstore.mdelete(allKeys);
        logger.info(
          `[Admin] Redis docstore cleared: ${allKeys.length} documents deleted.`
        );
      } else {
        logger.info(`[Admin] Redis docstore was already empty.`);
      }
    } else {
      setDocstore(new InMemoryStore());
      logger.info(`[Admin] In-memory docstore reset.`);
    }
    res.status(200).send({ message: "Document store cleared." });
  } catch (error) {
    logger.error("[Admin] Error clearing docstore:", error);
    res.status(500).json({ error: "Failed to clear document store." });
  }
});

module.exports = router;
