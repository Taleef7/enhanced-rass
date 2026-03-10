const { InMemoryStore } = require("langchain/storage/in_memory");

async function handleClearDocstore(req, res, dependencies) {
  const { docstore } = dependencies;

  try {
    if (!docstore) {
      return res
        .status(503)
        .json({ error: "Document store is not initialized." });
    }

    const { RedisDocumentStore } = require("../store/redisDocumentStore");

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
      docstore = new InMemoryStore();
      console.log(`[Admin] In-memory docstore reset.`);
    }

    res.status(200).send({ message: "Document store cleared." });
  } catch (error) {
    console.error("[Admin] Error clearing docstore:", error);
    res.status(500).json({ error: "Failed to clear document store." });
  }
}

module.exports = { handleClearDocstore };
