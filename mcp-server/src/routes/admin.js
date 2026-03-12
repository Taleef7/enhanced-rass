// mcp-server/src/routes/admin.js
// Phase D: Admin and compliance endpoints.
//
// Routes:
//   GET    /api/admin/audit-logs          — Paginated, filterable audit log viewer
//   GET    /api/admin/audit-logs/export   — CSV export for compliance submissions
//   DELETE /api/users/:id/data            — Right-to-erasure (GDPR purge)
//   POST   /api/admin/retention-sweep     — Manually trigger the retention sweep

"use strict";

const express = require("express");
const authMiddleware = require("../authMiddleware");
const { writeAuditLog } = require("../services/auditService");
const { purgeUserData, runRetentionSweep } = require("../services/PurgeService");
const { prisma } = require("../prisma");
const { apiLimiter, deleteLimiter } = require("../middleware/rateLimits");

const router = express.Router();

// ── Admin guard ───────────────────────────────────────────────────────────────
// For MVP, "admin" = user is an OWNER or ADMIN in at least one organization.
// In a future iteration this would be a dedicated isAdmin flag on the User model.

async function isOrgAdmin(userId) {
  const membership = await prisma.orgMember.findFirst({
    where: { userId, role: { in: ["OWNER", "ADMIN"] } },
  });
  return !!membership;
}

async function requireAdmin(req, res, next) {
  const admin = await isOrgAdmin(req.userId);
  if (!admin) {
    return res.status(403).json({ error: "Forbidden: requires org admin role." });
  }
  next();
}

// ── GET /api/admin/audit-logs ─────────────────────────────────────────────────

router.get("/api/admin/audit-logs", apiLimiter, authMiddleware, requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const skip = (page - 1) * limit;

  const { userId, action, workspaceId, outcome, dateFrom, dateTo } = req.query;

  const where = {};
  if (userId) where.userId = userId;
  if (action) where.action = { contains: action, mode: "insensitive" };
  if (workspaceId) where.workspaceId = workspaceId;
  if (outcome) where.outcome = outcome;
  if (dateFrom || dateTo) {
    where.timestamp = {};
    if (dateFrom) where.timestamp.gte = new Date(dateFrom);
    if (dateTo) where.timestamp.lte = new Date(dateTo);
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
    console.error("[Admin] Error fetching audit logs:", err.message);
    res.status(500).json({ error: "Failed to fetch audit logs." });
  }
});

// ── GET /api/admin/audit-logs/export ─────────────────────────────────────────

router.get("/api/admin/audit-logs/export", apiLimiter, authMiddleware, requireAdmin, async (req, res) => {
  const { userId, action, workspaceId, outcome, dateFrom, dateTo } = req.query;

  const where = {};
  if (userId) where.userId = userId;
  if (action) where.action = { contains: action, mode: "insensitive" };
  if (workspaceId) where.workspaceId = workspaceId;
  if (outcome) where.outcome = outcome;
  if (dateFrom || dateTo) {
    where.timestamp = {};
    if (dateFrom) where.timestamp.gte = new Date(dateFrom);
    if (dateTo) where.timestamp.lte = new Date(dateTo);
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
      // Wrap in double-quotes and escape any internal double-quotes
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
    console.error("[Admin] Error exporting audit logs:", err.message);
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
    console.error("[Admin] Error purging user data:", err.message);
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
      console.error("[Admin] Retention sweep error:", err.message)
    );
  } catch (err) {
    console.error("[Admin] Error triggering retention sweep:", err.message);
    res.status(500).json({ error: "Failed to trigger retention sweep." });
  }
});

// ── GET /api/admin/users — List all users (org admin view) ────────────────────

router.get("/api/admin/users", apiLimiter, authMiddleware, requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const skip = (page - 1) * limit;

  try {
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true, username: true, createdAt: true,
          _count: { select: { documents: true, chats: true, apiKeys: true } },
        },
      }),
      prisma.user.count(),
    ]);
    res.json({ users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error("[Admin] Error listing users:", err.message);
    res.status(500).json({ error: "Failed to list users." });
  }
});

module.exports = router;
