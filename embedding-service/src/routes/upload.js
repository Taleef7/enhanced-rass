const path = require("path");
const fs = require("fs-extra");
const { OpenSearchVectorStore } = require("@langchain/community/vectorstores/opensearch");
const { loadDocument } = require("../ingestion/parser");
const { createChunkers, splitDocuments } = require("../ingestion/chunker");

async function handleUpload(req, res, dependencies) {
  const {
    docstore,
    embeddings,
    openSearchClient,
    config,
  } = dependencies;

  const files = req.files;
  const { userId } = req.body;

  if (!userId) {
    return res
      .status(400)
      .json({ error: "Missing userId for document upload." });
  }

  console.log(`[Upload] Received ${files.length} file(s) from user: ${userId}`);

  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files uploaded." });
  }

  try {
    const { ensureIndexExists } = require("../clients/opensearchClient");
    await ensureIndexExists(
      openSearchClient,
      config.opensearch.indexName,
      config.opensearch.embedDim
    );

    const { parentSplitter, childSplitter } = await createChunkers(config.chunking);

    for (const file of files) {
      console.log(`[Processing] Starting: ${file.originalname}`);

      const docs = await loadDocument(file.path, file.originalname, userId);
      const { parentChunks, parentDocIds, childChunks } = await splitDocuments(
        docs,
        parentSplitter,
        childSplitter
      );

      await docstore.mset(
        parentChunks.map((chunk, i) => [parentDocIds[i], chunk])
      );

      const BATCH_SIZE = parseInt(process.env.BATCH_SIZE, 10) || 2000;

      if (childChunks.length > 0) {
        console.log(
          `[Indexing] ${childChunks.length} child chunks in batches of ${BATCH_SIZE}`
        );

        for (let i = 0; i < childChunks.length; i += BATCH_SIZE) {
          const batch = childChunks.slice(i, i + BATCH_SIZE);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          console.log(`  → Bulk batch #${batchNum}: ${batch.length} docs`);

          await OpenSearchVectorStore.fromDocuments(batch, embeddings, {
            client: openSearchClient,
            indexName: config.opensearch.indexName,
          });
        }
      }

      console.log(
        `[Success] Finished ${file.originalname}: ${parentChunks.length} parent chunks, ${childChunks.length} child chunks.`
      );

      await fs.unlink(file.path);
    }

    res.status(200).json({ success: true, message: "All files processed." });
  } catch (error) {
    console.error("[Upload] Critical error:", error);
    res.status(500).json({ error: "Error during upload." });
  }
}

module.exports = { handleUpload };
