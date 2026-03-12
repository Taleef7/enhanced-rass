// mcp-server/src/services/PurgeService.js
// Phase D: Comprehensive document purge — removes ALL traces of a document from
// every storage layer (OpenSearch vectors, Redis parents, Postgres metadata).
// Used by the right-to-erasure endpoint and the nightly retention sweep.

"use strict";

const axios = require("axios");
const { prisma } = require("../prisma");
const { writeAuditLog } = require("./auditService");
const { OPENSEARCH_HOST, OPENSEARCH_PORT } = require("../config");

const REDIS_SERVICE_URL =
  process.env.EMBEDDING_SERVICE_URL || "http://embedding-service:8001";

/**
 * Purge a single document from all storage systems.
 *
 * Steps:
 *  1. Fetch document metadata from Postgres.
 *  2. Delete all child chunks from OpenSearch (by documentId filter).
 *  3. Remove Redis parent keys (best-effort via embedding-service internal API).
 *  4. Mark Document.status = DELETED, set purgedAt / purgedBy in Postgres.
 *  5. Write audit log entry.
 *
 * @param {string} documentId  - Prisma Document id
 * @param {string} requestedBy - userId who requested the purge (or "system" for sweeps)
 * @returns {object} purgeSummary
 */
async function purgeDocument(documentId, requestedBy = "system") {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) {
    throw new Error(`Document ${documentId} not found.`);
  }

  const summary = {
    documentId,
    requestedBy,
    openSearchChunksRemoved: 0,
    redisKeysRemoved: 0,
    postgresUpdated: false,
    errors: [],
  };

  // 1. Remove OpenSearch vectors ────────────────────────────────────────────
  try {
    const indexName = doc.openSearchIndex || "knowledge_base";
    const osUrl = `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`;
    const deleteRes = await axios.post(
      `${osUrl}/${indexName}/_delete_by_query`,
      { query: { term: { "metadata.documentId": documentId } } },
      { headers: { "Content-Type": "application/json" }, timeout: 30000 }
    );
    summary.openSearchChunksRemoved = deleteRes.data?.deleted || 0;
  } catch (err) {
    summary.errors.push(`OpenSearch purge error: ${err.message}`);
    console.warn(`[PurgeService] OpenSearch purge failed for ${documentId}: ${err.message}`);
  }

  // 2. Remove Redis parent keys (best-effort) ───────────────────────────────
  if (doc.redisKeyPrefix) {
    try {
      const resp = await axios.delete(
        `${REDIS_SERVICE_URL}/internal/redis-parents`,
        {
          data: { keyPrefix: doc.redisKeyPrefix },
          headers: { "Content-Type": "application/json" },
          timeout: 10000,
        }
      );
      summary.redisKeysRemoved = resp.data?.deleted || 0;
    } catch (err) {
      summary.errors.push(`Redis purge error: ${err.message}`);
      console.warn(`[PurgeService] Redis purge failed for ${documentId}: ${err.message}`);
    }
  }

  // 3. Mark document as purged in Postgres ──────────────────────────────────
  try {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: "DELETED",
        deletedAt: doc.deletedAt || new Date(),
        purgedAt: new Date(),
        purgedBy: requestedBy,
      },
    });
    summary.postgresUpdated = true;
  } catch (err) {
    summary.errors.push(`Postgres update error: ${err.message}`);
    console.error(`[PurgeService] Postgres update failed for ${documentId}: ${err.message}`);
  }

  // 4. Write audit log ──────────────────────────────────────────────────────
  await writeAuditLog({
    userId: requestedBy === "system" ? null : requestedBy,
    action: "DOCUMENT_PURGED",
    resourceType: "Document",
    resourceId: documentId,
    outcome: summary.errors.length === 0 ? "SUCCESS" : "PARTIAL",
    metadata: summary,
  });

  return summary;
}

/**
 * Purge ALL documents and personal data for a user (right-to-erasure / GDPR).
 *
 * @param {string} targetUserId  - The user whose data is being purged
 * @param {string} requestedBy   - Admin userId performing the action
 * @returns {object} purgeSummary
 */
async function purgeUserData(targetUserId, requestedBy) {
  const documents = await prisma.document.findMany({
    where: { userId: targetUserId, status: { not: "DELETED" } },
    select: { id: true },
  });

  const documentSummaries = [];
  for (const { id } of documents) {
    const s = await purgeDocument(id, requestedBy);
    documentSummaries.push(s);
  }

  // Delete chats and messages
  const chatDeleteResult = await prisma.chat.deleteMany({ where: { userId: targetUserId } });

  // Write top-level audit entry
  await writeAuditLog({
    userId: requestedBy,
    action: "USER_DATA_PURGED",
    resourceType: "User",
    resourceId: targetUserId,
    outcome: "SUCCESS",
    metadata: {
      documentsProcessed: documentSummaries.length,
      chatsDeleted: chatDeleteResult.count,
    },
  });

  return {
    targetUserId,
    requestedBy,
    documentsProcessed: documentSummaries.length,
    chatsDeleted: chatDeleteResult.count,
    documentSummaries,
  };
}

/**
 * Run the nightly retention sweep.
 * Purges documents in workspaces with retentionDays set, where the document
 * was uploaded more than retentionDays ago.
 *
 * @returns {object[]} Array of purgeSummary objects
 */
async function runRetentionSweep() {
  console.log("[PurgeService] Starting retention sweep...");

  // Find workspaces with retention policies
  const workspaces = await prisma.workspace.findMany({
    where: { retentionDays: { not: null } },
    select: { id: true, retentionDays: true, name: true },
  });

  const allSummaries = [];

  for (const ws of workspaces) {
    const cutoff = new Date(Date.now() - ws.retentionDays * 24 * 60 * 60 * 1000);

    const expiredDocs = await prisma.document.findMany({
      where: {
        workspaceId: ws.id,
        uploadedAt: { lt: cutoff },
        status: { not: "DELETED" },
      },
      select: { id: true },
    });

    console.log(
      `[PurgeService] Workspace '${ws.name}' (${ws.id}): found ${expiredDocs.length} expired documents (cutoff: ${cutoff.toISOString()})`
    );

    for (const { id } of expiredDocs) {
      const summary = await purgeDocument(id, "system:retention-sweep");
      allSummaries.push(summary);
    }
  }

  console.log(`[PurgeService] Retention sweep complete. Purged ${allSummaries.length} documents.`);
  return allSummaries;
}

module.exports = { purgeDocument, purgeUserData, runRetentionSweep };
