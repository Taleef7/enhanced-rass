// mcp-server/src/routes/admin.js
// Phase D: Admin and compliance endpoints.
//
// Routes:
//   GET    /api/admin/audit-logs          — Paginated, filterable audit log viewer
//   GET    /api/admin/audit-logs/export   — CSV export for compliance submissions
//   DELETE /api/users/:id/data            — Right-to-erasure (GDPR purge)
//   POST   /api/admin/retention-sweep     — Manually trigger the retention sweep

"use strict";

const path = require("path");
const express = require("express");
const axios = require("axios");
const authMiddleware = require("../authMiddleware");
const { writeAuditLog } = require("../services/auditService");
const { purgeUserData, runRetentionSweep } = require("../services/PurgeService");
const { prisma } = require("../prisma");
const { apiLimiter, deleteLimiter } = require("../middleware/rateLimits");
const { EMBEDDING_SERVICE_BASE_URL } = require("../config");
const logger = require("../logger");

const router = express.Router();

// ── Admin guard ───────────────────────────────────────────────────────────────
// "Admin" = user is OWNER or ADMIN in at least one organization.
// Queries are scoped to the caller's organizations for multi-tenant isolation.

/**
 * Returns the set of orgIds where the given userId is an OWNER or ADMIN.
 * Empty array if no admin memberships.
 */
async function getAdminOrgIds(userId) {
  const memberships = await prisma.orgMember.findMany({
    where: { userId, role: { in: ["OWNER", "ADMIN"] } },
    select: { orgId: true },
  });
  return memberships.map((m) => m.orgId);
}

/**
 * Returns workspace IDs within the caller's admin orgs.
 */
async function getAdminWorkspaceIds(adminOrgIds) {
  if (adminOrgIds.length === 0) return [];
  const workspaces = await prisma.workspace.findMany({
    where: { orgId: { in: adminOrgIds } },
    select: { id: true },
  });
  return workspaces.map((w) => w.id);
}

async function requireAdmin(req, res, next) {
  const orgIds = await getAdminOrgIds(req.userId);
  if (orgIds.length === 0) {
    return res.status(403).json({ error: "Forbidden: requires org admin role." });
  }
  // Attach for downstream use in route handlers
  req.adminOrgIds = orgIds;
  next();
}

/**
 * Parse and validate a date query param. Returns { date: Date } on success,
 * sends a 400 response and returns { error: true } on failure.
 */
function parseDateParam(paramName, value, res) {
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) {
    res.status(400).json({ error: `Invalid '${paramName}' parameter; expected a valid ISO-8601 date string.` });
    return { error: true };
  }
  return { date: new Date(ts) };
}

// ── GET /api/admin/audit-logs ─────────────────────────────────────────────────

router.get("/api/admin/audit-logs", apiLimiter, authMiddleware, requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const skip = (page - 1) * limit;

  const { userId, action, workspaceId, outcome, dateFrom, dateTo } = req.query;

  // Scope to workspaces the caller administers
  const adminWorkspaceIds = await getAdminWorkspaceIds(req.adminOrgIds);

  const where = {
    // Only show logs for workspaces the caller has admin access to
    // (null workspaceId logs are also shown if caller has any admin role)
    OR: [
      { workspaceId: { in: adminWorkspaceIds } },
      { workspaceId: null },
    ],
  };

  if (userId) where.userId = userId;
  if (action) where.action = { contains: action, mode: "insensitive" };
  if (workspaceId) {
    // Ensure requested workspaceId is within the caller's admin scope
    if (!adminWorkspaceIds.includes(workspaceId)) {
      return res.status(403).json({ error: "Forbidden: workspace not in your admin scope." });
    }
    where.workspaceId = workspaceId;
  }
  if (outcome) where.outcome = outcome;

  if (dateFrom) {
    const { date, error } = parseDateParam("dateFrom", dateFrom, res);
    if (error) return;
    where.timestamp = { ...(where.timestamp || {}), gte: date };
  }
  if (dateTo) {
    const { date, error } = parseDateParam("dateTo", dateTo, res);
    if (error) return;
    where.timestamp = { ...(where.timestamp || {}), lte: date };
  }

  try {
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: "desc" },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error("[Admin] Error fetching audit logs:", err.message);
    res.status(500).json({ error: "Failed to fetch audit logs." });
  }
});

// ── GET /api/admin/audit-logs/export ─────────────────────────────────────────

router.get("/api/admin/audit-logs/export", apiLimiter, authMiddleware, requireAdmin, async (req, res) => {
  const { userId, action, workspaceId, outcome, dateFrom, dateTo } = req.query;

  // Scope to workspaces the caller administers
  const adminWorkspaceIds = await getAdminWorkspaceIds(req.adminOrgIds);

  // Validate and normalize date range inputs
  let fromDateObj = null;
  let toDateObj = null;
  if (dateFrom) {
    const { date, error } = parseDateParam("dateFrom", dateFrom, res);
    if (error) return;
    fromDateObj = date;
  }
  if (dateTo) {
    const { date, error } = parseDateParam("dateTo", dateTo, res);
    if (error) return;
    toDateObj = date;
  }

  const where = {
    OR: [
      { workspaceId: { in: adminWorkspaceIds } },
      { workspaceId: null },
    ],
  };

  if (userId) where.userId = userId;
  if (action) where.action = { contains: action, mode: "insensitive" };
  if (workspaceId) {
    if (!adminWorkspaceIds.includes(workspaceId)) {
      return res.status(403).json({ error: "Forbidden: workspace not in your admin scope." });
    }
    where.workspaceId = workspaceId;
  }
  if (outcome) where.outcome = outcome;
  if (fromDateObj || toDateObj) {
    where.timestamp = {};
    if (fromDateObj) where.timestamp.gte = fromDateObj;
    if (toDateObj) where.timestamp.lte = toDateObj;
  }

  try {
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: 50000, // Hard cap for export safety
    });

    // Build CSV
    const csvHeader = [
      "id", "timestamp", "userId", "workspaceId", "action",
      "resourceType", "resourceId", "ipAddress", "userAgent", "outcome", "metadata",
    ].join(",");

    const escape = (v) => {
      if (v == null) return "";
      const str = typeof v === "object" ? JSON.stringify(v) : String(v);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const csvRows = logs.map((row) =>
      [
        escape(row.id),
        escape(row.timestamp?.toISOString()),
        escape(row.userId),
        escape(row.workspaceId),
        escape(row.action),
        escape(row.resourceType),
        escape(row.resourceId),
        escape(row.ipAddress),
        escape(row.userAgent),
        escape(row.outcome),
        escape(row.metadata),
      ].join(",")
    );

    const csv = [csvHeader, ...csvRows].join("\n");

    const filename = `audit-logs-${new Date().toISOString().split("T")[0]}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    logger.error("[Admin] Error exporting audit logs:", err.message);
    res.status(500).json({ error: "Failed to export audit logs." });
  }
});

// ── DELETE /api/users/:id/data — Right-to-erasure ────────────────────────────

router.delete("/api/users/:id/data", deleteLimiter, authMiddleware, requireAdmin, async (req, res) => {
  const { id: targetUserId } = req.params;
  const requestedBy = req.userId;

  try {
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      return res.status(404).json({ error: "User not found." });
    }

    const summary = await purgeUserData(targetUserId, requestedBy);

    res.json({
      message: "User data purged successfully.",
      purgeSummary: summary,
    });
  } catch (err) {
    logger.error("[Admin] Error purging user data:", err.message);
    res.status(500).json({ error: "Failed to purge user data." });
  }
});

// ── POST /api/admin/retention-sweep — Manual trigger ─────────────────────────

router.post("/api/admin/retention-sweep", apiLimiter, authMiddleware, requireAdmin, async (req, res) => {
  const userId = req.userId;

  await writeAuditLog({
    userId,
    action: "RETENTION_SWEEP_TRIGGERED",
    resourceType: "System",
    outcome: "SUCCESS",
    metadata: { triggeredBy: "manual" },
    req,
  });

  try {
    // Run sweep asynchronously — respond immediately with 202
    res.status(202).json({ message: "Retention sweep started." });
    runRetentionSweep().catch((err) =>
      logger.error("[Admin] Retention sweep error:", err.message)
    );
  } catch (err) {
    logger.error("[Admin] Error triggering retention sweep:", err.message);
    res.status(500).json({ error: "Failed to trigger retention sweep." });
  }
});

// ── GET /api/admin/users — List users in admin's orgs ────────────────────────

router.get("/api/admin/users", apiLimiter, authMiddleware, requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const skip = (page - 1) * limit;

  try {
    // Scope to users who are members of the caller's admin orgs
    const orgMemberships = await prisma.orgMember.findMany({
      where: { orgId: { in: req.adminOrgIds } },
      select: { userId: true },
    });
    const orgUserIds = [...new Set(orgMemberships.map((m) => m.userId))];

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: orgUserIds } },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true, username: true, createdAt: true,
          _count: { select: { documents: true, chats: true, apiKeys: true } },
        },
      }),
      prisma.user.count({ where: { id: { in: orgUserIds } } }),
    ]);
    res.json({ users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    logger.error("[Admin] Error listing users:", err.message);
    res.status(500).json({ error: "Failed to list users." });
  }
});

// ── POST /api/admin/reindex-all ───────────────────────────────────────────────
// Phase 3.2: Re-triggers ingestion for all READY (or optionally FAILED) documents.
// Useful after config changes like CONTEXTUAL_RETRIEVAL_ENABLED or CHILD_CHUNK_SIZE.
// Accepts optional query params:
//   ?kbId=<id>         — restrict to a specific knowledge base
//   ?includeFailed=1   — also reindex documents with status FAILED

router.post("/api/admin/reindex-all", apiLimiter, authMiddleware, requireAdmin, async (req, res) => {
  const { kbId, includeFailed } = req.query;

  const statusFilter = ["READY"];
  if (includeFailed === "1" || includeFailed === "true") {
    statusFilter.push("FAILED");
  }

  const where = { status: { in: statusFilter } };
  if (kbId) where.kbId = kbId;

  let documents;
  try {
    documents = await prisma.document.findMany({
      where,
      include: { provenance: { select: { fileType: true } } },
      orderBy: { uploadedAt: "asc" },
    });
  } catch (err) {
    logger.error("[Admin] reindex-all: DB query failed:", err.message);
    return res.status(500).json({ error: "Failed to query documents." });
  }

  if (documents.length === 0) {
    return res.json({ message: "No documents to re-index.", queued: 0, failed: [] });
  }

  // Build reindex payload for the embedding-service
  const payload = documents.map((doc) => ({
    documentId: doc.id,
    originalName: doc.originalFilename,
    mimeType: doc.mimeType,
    fileSizeBytes: doc.fileSizeBytes,
    userId: doc.userId,
    kbId: doc.kbId || null,
    targetIndex: doc.openSearchIndex || null,
    fileType: doc.provenance?.fileType || path.extname(doc.originalFilename).slice(1).toLowerCase(),
  }));

  let embeddingResponse;
  try {
    embeddingResponse = await axios.post(
      `${EMBEDDING_SERVICE_BASE_URL}/internal/reindex`,
      { documents: payload },
      {
        timeout: 60000,
        headers: { "x-correlation-id": "admin-reindex-all" },
      }
    );
  } catch (err) {
    logger.error("[Admin] reindex-all: Embedding-service call failed:", err.message);
    return res.status(502).json({ error: "Failed to contact embedding-service." });
  }

  const { queued = [], failed = [] } = embeddingResponse.data;

  // Mark requeued documents back to QUEUED status in Postgres
  if (queued.length > 0) {
    const queuedIds = queued.map((q) => q.documentId);
    await prisma.document.updateMany({
      where: { id: { in: queuedIds } },
      data: { status: "QUEUED", errorMessage: null },
    }).catch((err) => logger.warn("[Admin] reindex-all: Could not update document statuses:", err.message));
  }

  await writeAuditLog({
    userId: req.userId,
    action: "REINDEX_ALL",
    outcome: "SUCCESS",
    metadata: { queued: queued.length, failed: failed.length, kbId: kbId || "all" },
    req,
  });

  logger.info(`[Admin] reindex-all: ${queued.length} queued, ${failed.length} failed (kbId: ${kbId || "all"})`);

  res.json({
    message: `Re-indexing started: ${queued.length} queued, ${failed.length} failed.`,
    queued: queued.length,
    failed,
  });
});

module.exports = router;
