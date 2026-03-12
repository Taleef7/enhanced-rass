// mcp-server/src/routes/workspaces.js
// Phase D: Multi-tenant workspace and organization management endpoints.
//
// Routes:
//   POST   /api/organizations                          — Create an organization
//   GET    /api/organizations                          — List orgs for current user
//   GET    /api/organizations/:orgId                   — Get org details
//   POST   /api/organizations/:orgId/members           — Add org member
//
//   POST   /api/organizations/:orgId/workspaces        — Create a workspace (provisions OS index)
//   GET    /api/organizations/:orgId/workspaces        — List workspaces in an org
//   GET    /api/workspaces/:id                         — Get workspace details
//   DELETE /api/workspaces/:id                         — Delete workspace + OS index + docs
//   GET    /api/workspaces/:id/usage                   — Workspace quota usage
//
//   POST   /api/workspaces/:id/members                 — Add workspace member
//   DELETE /api/workspaces/:workspaceId/members/:userId — Remove workspace member
//   PATCH  /api/workspaces/:workspaceId/members/:userId — Update member role

"use strict";

const express = require("express");
const axios = require("axios");
const authMiddleware = require("../authMiddleware");
const { writeAuditLog } = require("../services/auditService");
const { prisma } = require("../prisma");
const { OPENSEARCH_HOST, OPENSEARCH_PORT, EMBED_DIM } = require("../config");
const { apiLimiter, deleteLimiter } = require("../middleware/rateLimits");
const logger = require("../logger");

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateIndexName() {
  // Use timestamp-based random suffix instead of cuid2 for simplicity
  return `ws_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function provisionWorkspaceIndex(indexName, embedDim) {
  const osUrl = `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`;
  const checkRes = await axios.head(`${osUrl}/${indexName}`, {
    validateStatus: (s) => s === 200 || s === 404,
    timeout: 10000,
  });
  if (checkRes.status === 200) return;

  await axios.put(
    `${osUrl}/${indexName}`,
    {
      settings: { index: { knn: true, "knn.algo_param.ef_search": 100 } },
      mappings: {
        properties: {
          embedding: {
            type: "knn_vector",
            dimension: embedDim,
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
    { headers: { "Content-Type": "application/json" }, timeout: 15000 }
  );
  logger.info(`[Workspaces] Provisioned OpenSearch index: ${indexName}`);
}

async function deleteWorkspaceIndex(indexName) {
  try {
    const osUrl = `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`;
    await axios.delete(`${osUrl}/${indexName}`, {
      validateStatus: (s) => s === 200 || s === 404,
      timeout: 15000,
    });
    logger.info(`[Workspaces] Deleted OpenSearch index: ${indexName}`);
  } catch (err) {
    logger.warn(`[Workspaces] Could not delete OS index ${indexName}: ${err.message}`);
  }
}

/** Assert the caller is an OrgMember with the given role or higher. */
async function assertOrgRole(userId, orgId, minRole, res) {
  const roleOrder = { OWNER: 3, ADMIN: 2, MEMBER: 1 };
  const m = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { role: true },
  });
  if (!m) {
    res.status(403).json({ error: "Not a member of this organization." });
    return false;
  }
  if ((roleOrder[m.role] || 0) < (roleOrder[minRole] || 0)) {
    res.status(403).json({ error: `Requires ${minRole} role in this organization.` });
    return false;
  }
  return m.role;
}

/** Assert the caller is a WorkspaceMember with the given role or higher. */
async function assertWsRole(userId, workspaceId, minRole, res) {
  const roleOrder = { ADMIN: 3, EDITOR: 2, VIEWER: 1 };
  const m = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  if (!m) {
    res.status(403).json({ error: "Not a member of this workspace." });
    return false;
  }
  if ((roleOrder[m.role] || 0) < (roleOrder[minRole] || 0)) {
    res.status(403).json({ error: `Requires ${minRole} role in this workspace.` });
    return false;
  }
  return m.role;
}

// ── Organizations ─────────────────────────────────────────────────────────────

// POST /api/organizations — Create organization
router.post("/api/organizations", apiLimiter, authMiddleware, async (req, res) => {
  const userId = req.userId;
  const { name, plan } = req.body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "Organization name is required." });
  }

  const validPlans = ["FREE", "TEAM", "ENTERPRISE"];
  const orgPlan = validPlans.includes(plan) ? plan : "FREE";

  try {
    const org = await prisma.organization.create({
      data: {
        name: name.trim(),
        plan: orgPlan,
        members: {
          create: { userId, role: "OWNER" },
        },
      },
      include: { members: true },
    });

    await writeAuditLog({
      userId,
      action: "ORG_CREATED",
      resourceType: "Organization",
      resourceId: org.id,
      outcome: "SUCCESS",
      metadata: { name: org.name, plan: org.plan },
      req,
    });

    res.status(201).json(org);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Organization name already taken." });
    }
    logger.error("[Workspaces] Error creating org:", err.message);
    res.status(500).json({ error: "Failed to create organization." });
  }
});

// GET /api/organizations — List organizations for current user
router.get("/api/organizations", apiLimiter, authMiddleware, async (req, res) => {
  const userId = req.userId;
  try {
    const memberships = await prisma.orgMember.findMany({
      where: { userId },
      include: {
        Org: {
          include: { _count: { select: { workspaces: true, members: true } } },
        },
      },
    });
    res.json(memberships.map((m) => ({ ...m.Org, myRole: m.role })));
  } catch (err) {
    logger.error("[Workspaces] Error listing orgs:", err.message);
    res.status(500).json({ error: "Failed to list organizations." });
  }
});

// GET /api/organizations/:orgId
router.get("/api/organizations/:orgId", apiLimiter, authMiddleware, async (req, res) => {
  const { orgId } = req.params;
  const userId = req.userId;

  const role = await assertOrgRole(userId, orgId, "MEMBER", res);
  if (role === false) return;

  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: { members: { include: { User: { select: { id: true, username: true } } } }, workspaces: true },
    });
    if (!org) return res.status(404).json({ error: "Organization not found." });
    res.json(org);
  } catch (err) {
    logger.error("[Workspaces] Error fetching org:", err.message);
    res.status(500).json({ error: "Failed to fetch organization." });
  }
});

// POST /api/organizations/:orgId/members — Add member to org
router.post("/api/organizations/:orgId/members", apiLimiter, authMiddleware, async (req, res) => {
  const { orgId } = req.params;
  const userId = req.userId;
  const { targetUserId, role } = req.body;

  if (!targetUserId || typeof targetUserId !== "string") {
    return res.status(400).json({ error: "targetUserId is required." });
  }

  const callerRole = await assertOrgRole(userId, orgId, "ADMIN", res);
  if (callerRole === false) return;

  const validRoles = ["OWNER", "ADMIN", "MEMBER"];
  const memberRole = validRoles.includes(role) ? role : "MEMBER";

  try {
    // Verify the target user exists before upserting (avoids FK constraint 500)
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!targetUser) {
      return res.status(404).json({ error: "Target user not found." });
    }

    const member = await prisma.orgMember.upsert({
      where: { orgId_userId: { orgId, userId: targetUserId } },
      update: { role: memberRole },
      create: { orgId, userId: targetUserId, role: memberRole },
    });

    await writeAuditLog({
      userId,
      action: "ORG_MEMBER_ADDED",
      resourceType: "Organization",
      resourceId: orgId,
      outcome: "SUCCESS",
      metadata: { targetUserId, role: memberRole },
      req,
    });

    res.status(201).json(member);
  } catch (err) {
    logger.error("[Workspaces] Error adding org member:", err.message);
    res.status(500).json({ error: "Failed to add organization member." });
  }
});

// ── Workspaces ────────────────────────────────────────────────────────────────

// POST /api/organizations/:orgId/workspaces — Create workspace
router.post("/api/organizations/:orgId/workspaces", apiLimiter, authMiddleware, async (req, res) => {
  const { orgId } = req.params;
  const userId = req.userId;
  const { name, quotaMb, retentionDays } = req.body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "Workspace name is required." });
  }

  // Validate optional numeric fields
  let parsedQuotaMb = 500;
  if (quotaMb !== undefined && quotaMb !== null) {
    const q = Number(quotaMb);
    if (!Number.isFinite(q) || !Number.isInteger(q) || q <= 0) {
      return res.status(400).json({ error: "quotaMb must be a positive integer." });
    }
    parsedQuotaMb = q;
  }

  let parsedRetentionDays = null;
  if (retentionDays !== undefined && retentionDays !== null) {
    const r = Number(retentionDays);
    if (!Number.isFinite(r) || !Number.isInteger(r) || r < 0) {
      return res.status(400).json({ error: "retentionDays must be a non-negative integer." });
    }
    parsedRetentionDays = r;
  }

  const callerRole = await assertOrgRole(userId, orgId, "ADMIN", res);
  if (callerRole === false) return;

  const indexName = generateIndexName();

  try {
    // Provision OpenSearch index BEFORE creating the DB record.
    // On DB failure below, we best-effort delete the index to avoid orphaning it.
    await provisionWorkspaceIndex(indexName, EMBED_DIM);

    let workspace;
    try {
      workspace = await prisma.workspace.create({
        data: {
          orgId,
          name: name.trim(),
          openSearchIndex: indexName,
          quotaMb: parsedQuotaMb,
          retentionDays: parsedRetentionDays,
          members: {
            create: { userId, role: "ADMIN" },
          },
        },
        include: { members: true },
      });
    } catch (dbErr) {
      // Roll back the provisioned OS index to avoid orphaning it
      await deleteWorkspaceIndex(indexName);
      throw dbErr;
    }

    await writeAuditLog({
      userId,
      workspaceId: workspace.id,
      action: "WORKSPACE_CREATED",
      resourceType: "Workspace",
      resourceId: workspace.id,
      outcome: "SUCCESS",
      metadata: { name: workspace.name, indexName, orgId },
      req,
    });

    res.status(201).json(workspace);
  } catch (err) {
    logger.error("[Workspaces] Error creating workspace:", err.message);
    res.status(500).json({ error: "Failed to create workspace." });
  }
});

// GET /api/organizations/:orgId/workspaces — List workspaces
router.get("/api/organizations/:orgId/workspaces", apiLimiter, authMiddleware, async (req, res) => {
  const { orgId } = req.params;
  const userId = req.userId;

  const role = await assertOrgRole(userId, orgId, "MEMBER", res);
  if (role === false) return;

  try {
    const workspaces = await prisma.workspace.findMany({
      where: { orgId },
      include: {
        _count: { select: { members: true, documents: true } },
        members: { where: { userId }, select: { role: true } },
      },
    });
    res.json(workspaces.map((ws) => ({
      ...ws,
      myRole: ws.members[0]?.role || null,
    })));
  } catch (err) {
    logger.error("[Workspaces] Error listing workspaces:", err.message);
    res.status(500).json({ error: "Failed to list workspaces." });
  }
});

// GET /api/workspaces/:id — Get workspace details
router.get("/api/workspaces/:id", apiLimiter, authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const ws = await prisma.workspace.findUnique({
      where: { id },
      include: {
        members: { include: { User: { select: { id: true, username: true } } } },
        Org: { select: { id: true, name: true, plan: true } },
      },
    });
    if (!ws) return res.status(404).json({ error: "Workspace not found." });

    const isMember = ws.members.some((m) => m.userId === userId);
    if (!isMember) return res.status(403).json({ error: "Not a member of this workspace." });

    res.json(ws);
  } catch (err) {
    logger.error("[Workspaces] Error fetching workspace:", err.message);
    res.status(500).json({ error: "Failed to fetch workspace." });
  }
});

// GET /api/workspaces/:id/usage — Quota usage
router.get("/api/workspaces/:id/usage", apiLimiter, authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  const role = await assertWsRole(userId, id, "VIEWER", res);
  if (role === false) return;

  try {
    const ws = await prisma.workspace.findUnique({
      where: { id },
      select: { id: true, name: true, quotaMb: true, usedMb: true },
    });
    if (!ws) return res.status(404).json({ error: "Workspace not found." });

    const usagePct = ws.quotaMb > 0 ? ((ws.usedMb / ws.quotaMb) * 100).toFixed(1) : 0;
    res.json({ ...ws, usagePct: parseFloat(usagePct), limitReached: ws.usedMb >= ws.quotaMb });
  } catch (err) {
    logger.error("[Workspaces] Error fetching usage:", err.message);
    res.status(500).json({ error: "Failed to fetch workspace usage." });
  }
});

// DELETE /api/workspaces/:id — Delete workspace
router.delete("/api/workspaces/:id", deleteLimiter, authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  const role = await assertWsRole(userId, id, "ADMIN", res);
  if (role === false) return;

  try {
    const ws = await prisma.workspace.findUnique({ where: { id } });
    if (!ws) return res.status(404).json({ error: "Workspace not found." });

    // Delete OpenSearch index
    await deleteWorkspaceIndex(ws.openSearchIndex);

    // Soft-delete all documents in this workspace
    await prisma.document.updateMany({
      where: { workspaceId: id, status: { not: "DELETED" } },
      data: { status: "DELETED", deletedAt: new Date() },
    });

    // Delete the workspace (cascades to members)
    await prisma.workspace.delete({ where: { id } });

    await writeAuditLog({
      userId,
      workspaceId: id,
      action: "WORKSPACE_DELETED",
      resourceType: "Workspace",
      resourceId: id,
      outcome: "SUCCESS",
      metadata: { name: ws.name, openSearchIndex: ws.openSearchIndex },
      req,
    });

    res.json({ message: "Workspace deleted successfully.", id });
  } catch (err) {
    logger.error("[Workspaces] Error deleting workspace:", err.message);
    res.status(500).json({ error: "Failed to delete workspace." });
  }
});

// POST /api/workspaces/:id/members — Add workspace member
router.post("/api/workspaces/:id/members", apiLimiter, authMiddleware, async (req, res) => {
  const workspaceId = req.params.id;
  const userId = req.userId;
  const { targetUserId, role } = req.body;

  const callerRole = await assertWsRole(userId, workspaceId, "ADMIN", res);
  if (callerRole === false) return;

  const validRoles = ["ADMIN", "EDITOR", "VIEWER"];
  const memberRole = validRoles.includes(role) ? role : "VIEWER";

  try {
    const member = await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      update: { role: memberRole },
      create: { workspaceId, userId: targetUserId, role: memberRole },
    });

    await writeAuditLog({
      userId,
      workspaceId,
      action: "WORKSPACE_MEMBER_ADDED",
      resourceType: "Workspace",
      resourceId: workspaceId,
      outcome: "SUCCESS",
      metadata: { targetUserId, role: memberRole },
      req,
    });

    res.status(201).json(member);
  } catch (err) {
    logger.error("[Workspaces] Error adding workspace member:", err.message);
    res.status(500).json({ error: "Failed to add workspace member." });
  }
});

// DELETE /api/workspaces/:workspaceId/members/:memberId — Remove workspace member
router.delete("/api/workspaces/:workspaceId/members/:memberId", deleteLimiter, authMiddleware, async (req, res) => {
  const { workspaceId, memberId } = req.params;
  const userId = req.userId;

  const callerRole = await assertWsRole(userId, workspaceId, "ADMIN", res);
  if (callerRole === false) return;

  try {
    // IDOR protection: verify the member record belongs to this workspace before deleting
    const membership = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
    });

    if (!membership) {
      return res.status(404).json({ error: "Member not found." });
    }

    if (membership.workspaceId !== workspaceId) {
      // Do not reveal existence of members in other workspaces
      return res.status(404).json({ error: "Member not found in this workspace." });
    }

    await prisma.workspaceMember.delete({ where: { id: memberId } });

    await writeAuditLog({
      userId,
      workspaceId,
      action: "WORKSPACE_MEMBER_REMOVED",
      resourceType: "Workspace",
      resourceId: workspaceId,
      outcome: "SUCCESS",
      metadata: { memberId, removedUserId: membership.userId },
      req,
    });

    res.json({ message: "Member removed." });
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "Member not found." });
    logger.error("[Workspaces] Error removing member:", err.message);
    res.status(500).json({ error: "Failed to remove workspace member." });
  }
});

// PATCH /api/workspaces/:workspaceId/members/:memberId — Update member role
router.patch("/api/workspaces/:workspaceId/members/:memberId", apiLimiter, authMiddleware, async (req, res) => {
  const { workspaceId, memberId } = req.params;
  const userId = req.userId;
  const { role } = req.body;

  const callerRole = await assertWsRole(userId, workspaceId, "ADMIN", res);
  if (callerRole === false) return;

  const validRoles = ["ADMIN", "EDITOR", "VIEWER"];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(", ")}` });
  }

  try {
    // IDOR protection: verify the member record belongs to this workspace before updating
    const membership = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
    });

    if (!membership) {
      return res.status(404).json({ error: "Member not found." });
    }

    if (membership.workspaceId !== workspaceId) {
      return res.status(404).json({ error: "Member not found in this workspace." });
    }

    const updated = await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role },
    });

    await writeAuditLog({
      userId,
      workspaceId,
      action: "WORKSPACE_MEMBER_ROLE_CHANGED",
      resourceType: "Workspace",
      resourceId: workspaceId,
      outcome: "SUCCESS",
      metadata: { memberId, targetUserId: membership.userId, newRole: role, previousRole: membership.role },
      req,
    });

    res.json(updated);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "Member not found." });
    logger.error("[Workspaces] Error updating member role:", err.message);
    res.status(500).json({ error: "Failed to update member role." });
  }
});

// PATCH /api/workspaces/:id — Update workspace settings (retention, quota)
router.patch("/api/workspaces/:id", apiLimiter, authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;
  const { retentionDays, quotaMb, name } = req.body;

  const role = await assertWsRole(userId, id, "ADMIN", res);
  if (role === false) return;

  const updateData = {};

  // Validate and normalize name if provided
  if (name !== undefined) {
    if (typeof name !== "string") {
      return res.status(400).json({ error: "name must be a string." });
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ error: "name cannot be empty." });
    }
    if (trimmedName.length > 255) {
      return res.status(400).json({ error: "name must be at most 255 characters." });
    }
    updateData.name = trimmedName;
  }

  // Validate quotaMb if provided
  if (quotaMb !== undefined && quotaMb !== null) {
    const q = Number(quotaMb);
    if (!Number.isFinite(q) || !Number.isInteger(q) || q <= 0) {
      return res.status(400).json({ error: "quotaMb must be a positive integer." });
    }
    updateData.quotaMb = q;
  }

  // Validate retentionDays if provided (null = disable retention)
  if (retentionDays !== undefined) {
    if (retentionDays === null) {
      updateData.retentionDays = null;
    } else {
      const r = Number(retentionDays);
      if (!Number.isFinite(r) || !Number.isInteger(r) || r < 0) {
        return res.status(400).json({ error: "retentionDays must be a non-negative integer or null to disable." });
      }
      if (r > 3650) {
        return res.status(400).json({ error: "retentionDays cannot exceed 3650 (10 years)." });
      }
      updateData.retentionDays = r;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: "No valid fields provided for update." });
  }

  try {
    const updated = await prisma.workspace.update({
      where: { id },
      data: updateData,
    });

    await writeAuditLog({
      userId,
      workspaceId: id,
      action: "WORKSPACE_SETTINGS_UPDATED",
      resourceType: "Workspace",
      resourceId: id,
      outcome: "SUCCESS",
      metadata: updateData,
      req,
    });

    res.json(updated);
  } catch (err) {
    logger.error("[Workspaces] Error updating workspace:", err.message);
    res.status(500).json({ error: "Failed to update workspace." });
  }
});

module.exports = router;
