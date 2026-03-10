// embedding-service/src/routes/upload.js
// POST /upload — Accepts one or more files, runs parent/child chunking,
// embeds child chunks into OpenSearch, and stores parent chunks in the docstore.

const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs-extra");
const path = require("path");
const {
  OpenSearchVectorStore,
} = require("@langchain/community/vectorstores/opensearch");

const { openSearchClient, ensureIndexExists } = require("../clients/opensearchClient");
const { embeddings } = require("../clients/embedder");
const { getDocstore } = require("../clients/redisClient");
const { getLoader } = require("../ingestion/parser");
const { parentSplitter, childSplitter } = require("../ingestion/chunker");
const { OPENSEARCH_INDEX_NAME } = require("../config");

fs.ensureDirSync("./temp");
const upload = multer({ dest: "./temp" });

const router = express.Router();

router.post("/upload", upload.array("files"), async (req, res) => {
  const files = req.files;
  const { userId } = req.body;

  if (!userId) {
    return res
      .status(400)
      .json({ error: "Missing userId for document upload." });
  }

  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files uploaded." });
  }

  console.log(`[Upload] Received ${files.length} file(s) from user: ${userId}`);

  try {
    await ensureIndexExists();

    for (const file of files) {
      console.log(`[Processing] Starting: ${file.originalname}`);
      const loader = getLoader(file.path, file.originalname);
      const docs = await loader.load();

      docs.forEach((doc) => {
        doc.metadata.userId = userId;
        doc.metadata.originalFilename = file.originalname;
        doc.metadata.uploadedAt = new Date().toISOString();
      });

      const parentChunks = await parentSplitter.splitDocuments(docs);
      const parentDocIds = parentChunks.map(() => uuidv4());

      const docstore = getDocstore();
      await docstore.mset(
        parentChunks.map((chunk, i) => [parentDocIds[i], chunk])
      );

      let childChunks = [];
      for (let i = 0; i < parentChunks.length; i++) {
        const subDocs = await childSplitter.splitDocuments([parentChunks[i]]);
        subDocs.forEach((doc) => {
          doc.metadata.parentId = parentDocIds[i];
          doc.metadata.userId = parentChunks[i].metadata.userId;
          doc.metadata.originalFilename = parentChunks[i].metadata.originalFilename;
          doc.metadata.uploadedAt = parentChunks[i].metadata.uploadedAt;
          childChunks.push(doc);
        });
      }

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
            indexName: OPENSEARCH_INDEX_NAME,
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
});

module.exports = router;
