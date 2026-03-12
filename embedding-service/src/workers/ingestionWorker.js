// embedding-service/src/workers/ingestionWorker.js
// BullMQ worker that processes async document ingestion jobs.
// Pipeline: parse → chunk → embed → index → provenance
// Emits progress events (0 → 25 → 75 → 100) and updates document status
// via the mcp-server internal API.

"use strict";

const { Worker } = require("bullmq");
const { performance } = require("perf_hooks");
const crypto = require("crypto");
const fs = require("fs-extra");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const axios = require("axios");
const {
  OpenSearchVectorStore,
} = require("@langchain/community/vectorstores/opensearch");

const { connection } = require("../queue/ingestionQueue");
const { openSearchClient } = require("../clients/opensearchClient");
const { embeddings, EMBEDDING_MODEL_NAME } = require("../clients/embedder");
const { getDocstore } = require("../clients/redisClient");
const { getLoader } = require("../ingestion/parser");
const { createChunker } = require("../chunking");
const logger = require("../logger");
const {
  CHUNKING_STRATEGY,
  PARENT_CHUNK_SIZE,
  PARENT_CHUNK_OVERLAP,
  CHILD_CHUNK_SIZE,
  CHILD_CHUNK_OVERLAP,
  OPENSEARCH_INDEX_NAME,
  EMBED_DIM,
} = require("../config");

// Internal mcp-server base URL for service-to-service calls (DB updates).
const MCP_SERVER_INTERNAL_URL =
  process.env.MCP_SERVER_URL || "http://mcp-server:8080";

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE, 10) || 2000;

// Shared secret for authenticating calls to mcp-server internal routes.
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || "";
const internalHeaders = INTERNAL_SERVICE_TOKEN
  ? { "x-internal-token": INTERNAL_SERVICE_TOKEN }
  : {};

// ── Helper: notify mcp-server of status changes ──────────────────────────────

async function updateDocumentStatus(documentId, status, extra = {}) {
  if (!documentId) return;
  try {
    await axios.patch(
      `${MCP_SERVER_INTERNAL_URL}/internal/documents/${documentId}/status`,
      { status, ...extra },
      { timeout: 10000, headers: internalHeaders }
    );
  } catch (err) {
    // Non-fatal — log but don't fail the job
    logger.warn(
      `[Worker] Could not update document status (${documentId} → ${status}): ${err.message}`
    );
  }
}

async function persistProvenance(provenanceData) {
  try {
    await axios.post(
      `${MCP_SERVER_INTERNAL_URL}/internal/documents/${provenanceData.documentId}/provenance`,
      provenanceData,
      { timeout: 10000, headers: internalHeaders }
    );
  } catch (err) {
    logger.warn(`[Worker] Could not persist provenance: ${err.message}`);
  }
}

async function writeAuditLog(entry) {
  try {
    await axios.post(`${MCP_SERVER_INTERNAL_URL}/internal/audit`, entry, {
      timeout: 5000,
      headers: internalHeaders,
    });
  } catch (_) {
    // audit log failure is never fatal
  }
}

// ── Ensure the target OpenSearch index exists ─────────────────────────────────

async function ensureKBIndexExists(indexName, embedDim) {
  if (indexName === OPENSEARCH_INDEX_NAME) {
    // Default index is already ensured at startup
    return;
  }
  const exists = await openSearchClient.indices.exists({ index: indexName });
  if (!exists.body) {
    await openSearchClient.indices.create({
      index: indexName,
      body: {
        settings: { index: { knn: true, "knn.algo_param.ef_search": 100 } },
        mappings: {
          properties: {
            embedding: {
              type: "knn_vector",
              dimension: embedDim || EMBED_DIM,
              method: {
                name: "hnsw",
                space_type: "l2",
                engine: "faiss",
                parameters: { ef_construction: 256, m: 48 },
              },
            },
          },
        },
      },
    });
    logger.info(`[Worker] Created OpenSearch index: ${indexName}`);
  }
}

// ── Main worker processor ─────────────────────────────────────────────────────

async function processIngestionJob(job) {
  const {
    filePath,
    originalName,
    mimeType,
    fileSizeBytes,
    userId,
    documentId,
    kbId,
    targetIndex,
    chunkingStrategyOverride,
    chunkingOptionsOverride,
  } = job.data;

  const jobId = job.id;
  const stagesMs = {};

  logger.info(`[Worker] Starting job ${jobId}: ${originalName} (doc: ${documentId})`);
  await job.updateProgress(0);

  // Update document status → PROCESSING
  await updateDocumentStatus(documentId, "PROCESSING");

  const indexName = targetIndex || OPENSEARCH_INDEX_NAME;
  await ensureKBIndexExists(indexName, EMBED_DIM);

  // ── Stage 1: Parse ──────────────────────────────────────────────────────────
  const t0 = performance.now();
  let docs;
  let rawSha256;
  try {
    const rawBytes = await fs.readFile(filePath);
    rawSha256 = crypto.createHash("sha256").update(rawBytes).digest("hex");

    const loader = getLoader(filePath, originalName);
    docs = await loader.load();

    docs.forEach((doc) => {
      doc.metadata.userId = userId;
      doc.metadata.originalFilename = originalName;
      doc.metadata.uploadedAt = new Date().toISOString();
      if (documentId) doc.metadata.documentId = documentId;
      if (kbId) doc.metadata.kbId = kbId;
    });

    stagesMs.parse = Math.round(performance.now() - t0);
    logger.info(
      `[Worker] Parse stage: ${docs.length} pages in ${stagesMs.parse}ms`
    );
  } catch (err) {
    await updateDocumentStatus(documentId, "FAILED", {
      errorMessage: `Parse failed: ${err.message}`,
    });
    throw err;
  }

  await job.updateProgress(25);

  // ── Stage 2: Chunk ──────────────────────────────────────────────────────────
  const t1 = performance.now();
  let parentChunks;
  let childChunks = [];
  let chunkingStrategy;
  let chunkingOptions;
  try {
    const resolvedStrategy = chunkingStrategyOverride || CHUNKING_STRATEGY;

    // Build strategy-specific default options
    let defaultOptions;
    if (resolvedStrategy === "sentence_window") {
      defaultOptions = { windowSize: 10, overlapSentences: 2 };
    } else {
      defaultOptions = { chunkSize: PARENT_CHUNK_SIZE, chunkOverlap: PARENT_CHUNK_OVERLAP };
    }

    const parentChunker = createChunker(
      resolvedStrategy,
      chunkingOptionsOverride || defaultOptions
    );
    chunkingStrategy = parentChunker.name;
    chunkingOptions = parentChunker.options;

    parentChunks = await parentChunker.splitDocuments(docs);
    const parentDocIds = parentChunks.map(() => uuidv4());

    // Store parent chunks in Redis docstore
    const docstore = getDocstore();
    if (docstore) {
      await docstore.mset(
        parentChunks.map((chunk, i) => [parentDocIds[i], chunk])
      );
    }

    // Child chunker (always fixed/recursive for dense indexing)
    const childChunker = createChunker("recursive_character", {
      chunkSize: CHILD_CHUNK_SIZE,
      chunkOverlap: CHILD_CHUNK_OVERLAP,
    });

    for (let i = 0; i < parentChunks.length; i++) {
      const subDocs = await childChunker.splitDocuments([parentChunks[i]]);
      subDocs.forEach((doc) => {
        doc.metadata.parentId = parentDocIds[i];
        doc.metadata.userId = parentChunks[i].metadata.userId;
        doc.metadata.originalFilename = parentChunks[i].metadata.originalFilename;
        doc.metadata.uploadedAt = parentChunks[i].metadata.uploadedAt;
        if (documentId) doc.metadata.documentId = documentId;
        childChunks.push(doc);
      });
    }

    stagesMs.chunk = Math.round(performance.now() - t1);
    logger.info(
      `[Worker] Chunk stage: ${parentChunks.length} parents, ${childChunks.length} children in ${stagesMs.chunk}ms`
    );
  } catch (err) {
    await updateDocumentStatus(documentId, "FAILED", {
      errorMessage: `Chunk failed: ${err.message}`,
    });
    throw err;
  }

  await job.updateProgress(50);

  // ── Stage 3: Embed + Index ──────────────────────────────────────────────────
  const t2 = performance.now();
  try {
    if (childChunks.length > 0) {
      logger.info(
        `[Worker] Indexing ${childChunks.length} child chunks in batches of ${BATCH_SIZE}`
      );
      for (let i = 0; i < childChunks.length; i += BATCH_SIZE) {
        const batch = childChunks.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        logger.info(`  → Bulk batch #${batchNum}: ${batch.length} docs`);
        await OpenSearchVectorStore.fromDocuments(batch, embeddings, {
          client: openSearchClient,
          indexName,
        });
      }
    }
    stagesMs.embedAndIndex = Math.round(performance.now() - t2);
    logger.info(
      `[Worker] Embed+Index stage: ${stagesMs.embedAndIndex}ms`
    );
  } catch (err) {
    await updateDocumentStatus(documentId, "FAILED", {
      errorMessage: `Embed/index failed: ${err.message}`,
    });
    throw err;
  }

  await job.updateProgress(75);

  // ── Stage 4: Provenance + DB update ─────────────────────────────────────────
  const pageCount = docs.length;
  const modelName = EMBEDDING_MODEL_NAME || "unknown";

  await persistProvenance({
    documentId,
    userId,
    ingestionJobId: String(jobId),
    rawFileSha256: rawSha256,
    fileType: path.extname(originalName).toLowerCase().replace(".", ""),
    fileSizeBytes: fileSizeBytes || 0,
    pageCount,
    chunkingStrategy: { strategy: chunkingStrategy, ...chunkingOptions },
    embeddingModel: modelName,
    embeddingDim: EMBED_DIM,
    chunkCount: childChunks.length,
    parentCount: parentChunks.length,
    stagesMs,
  });

  await updateDocumentStatus(documentId, "READY", {
    chunkCount: childChunks.length,
    processedAt: new Date().toISOString(),
  });

  await writeAuditLog({
    userId,
    action: "DOCUMENT_INGESTED",
    resource: documentId,
    outcome: "SUCCESS",
    metadata: {
      jobId,
      originalName,
      chunkCount: childChunks.length,
      indexName,
    },
  });

  // Clean up temp file
  try {
    await fs.unlink(filePath);
  } catch (_) {
    // ignore cleanup errors
  }

  await job.updateProgress(100);

  logger.info(
    `[Worker] Job ${jobId} complete: ${originalName} → ${parentChunks.length} parents, ${childChunks.length} children`
  );

  return {
    originalName,
    parentCount: parentChunks.length,
    chunkCount: childChunks.length,
    stagesMs,
  };
}

// ── Worker instantiation ──────────────────────────────────────────────────────

function createIngestionWorker() {
  const worker = new Worker("rass:ingestion", processIngestionJob, {
    connection,
    concurrency: parseInt(process.env.INGESTION_CONCURRENCY, 10) || 2,
  });

  worker.on("completed", (job, result) => {
    logger.info(`[Worker] Job ${job.id} completed:`, result?.originalName);
  });

  worker.on("failed", (job, err) => {
    logger.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
  });

  worker.on("progress", (job, progress) => {
    logger.info(`[Worker] Job ${job.id} progress: ${progress}%`);
  });

  worker.on("error", (err) => {
    logger.error("[Worker] Worker error:", err.message);
  });

  logger.info("[Worker] Ingestion worker started (concurrency: 2)");
  return worker;
}

module.exports = { createIngestionWorker };
