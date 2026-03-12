// mcp-server/src/middleware/requirePermission.js
// Phase D: RBAC middleware — gate routes to workspace members with the required permission.
//
// Usage:
//   router.delete('/api/documents/:id',
//     authMiddleware,
//     requirePermission(PERMISSIONS.DOCUMENT_DELETE),
//     handler);
//
// The middleware looks up the caller's WorkspaceMember role for the workspaceId
// found on the target document (or from req.params.workspaceId / req.body.workspaceId).
// If no workspace context is present it falls through to the next handler so that
// non-workspace (legacy personal) routes are unaffected.

"use strict";

const { prisma } = require("../prisma");
const { ROLE_PERMISSIONS } = require("../permissions");
const { writeAuditLog } = require("../services/auditService");

/**
 * Returns Express middleware that checks the caller has the given permission
 * within the workspace associated with the request.
 *
 * @param {string} permission  - One of the PERMISSIONS constants
 */
function requirePermission(permission) {
  return async (req, res, next) => {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized." });
    }

    // Resolve workspaceId from multiple sources (params → body → doc lookup)
    let workspaceId =
      req.params.workspaceId ||
      req.body?.workspaceId ||
      req.query?.workspaceId ||
      null;

    // If still not found but we have a documentId, look up the doc's workspace
    if (!workspaceId && req.params.id) {
      try {
        // Note: we do NOT filter by userId here — workspace members should be able to
        // access any document within their workspace, regardless of who uploaded it.
        const doc = await prisma.document.findFirst({
          where: { id: req.params.id },
          select: { workspaceId: true },
        });
        workspaceId = doc?.workspaceId || null;
      } catch (err) {
        // DB error during workspace resolution — fail closed to prevent unauthorized access
        console.error("[requirePermission] Error during document workspace lookup:", err.message);
        return res.status(500).json({ error: "Internal server error during workspace resolution." });
      }
    }

    // No workspace context → fall through (personal / legacy route)
    if (!workspaceId) {
      return next();
    }

    try {
      const membership = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { role: true },
      });

      if (!membership) {
        await writeAuditLog({
          userId,
          workspaceId,
          action: "PERMISSION_DENIED",
          resourceType: "Workspace",
          resourceId: workspaceId,
          outcome: "FAILURE",
          metadata: { permission, reason: "not a workspace member" },
          req,
        });
        return res.status(403).json({ error: "Forbidden: not a workspace member." });
      }

      const allowed = ROLE_PERMISSIONS[membership.role] || [];
      if (!allowed.includes(permission)) {
        await writeAuditLog({
          userId,
          workspaceId,
          action: "PERMISSION_DENIED",
          resourceType: "Workspace",
          resourceId: workspaceId,
          outcome: "FAILURE",
          metadata: { permission, role: membership.role },
          req,
        });
        return res.status(403).json({
          error: `Forbidden: role '${membership.role}' does not have permission '${permission}'.`,
        });
      }

      // Attach resolved role for downstream handlers
      req.workspaceRole = membership.role;
      req.workspaceId = workspaceId;
      next();
    } catch (err) {
      console.error("[requirePermission] Error:", err.message);
      res.status(500).json({ error: "Internal server error during permission check." });
    }
  };
}

module.exports = { requirePermission };
