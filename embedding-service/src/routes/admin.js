// embedding-service/src/routes/admin.js
// POST /clear-docstore — Clears all documents from the active docstore.

const express = require("express");
const { InMemoryStore } = require("langchain/storage/in_memory");
const { getDocstore, setDocstore } = require("../clients/redisClient");
const { RedisDocumentStore } = require("../store/redisDocumentStore");

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
        console.log(
          `[Admin] Redis docstore cleared: ${allKeys.length} documents deleted.`
        );
      } else {
        console.log(`[Admin] Redis docstore was already empty.`);
      }
    } else {
      setDocstore(new InMemoryStore());
      console.log(`[Admin] In-memory docstore reset.`);
    }
    res.status(200).send({ message: "Document store cleared." });
  } catch (error) {
    console.error("[Admin] Error clearing docstore:", error);
    res.status(500).json({ error: "Failed to clear document store." });
  }
});

module.exports = router;
