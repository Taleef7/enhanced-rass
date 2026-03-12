// mcp-server/src/services/auditService.js
// Phase D: Writes structured, tamper-evident audit events to the AuditLog table.
// AuditLog records are APPEND-ONLY — never updated or deleted via this service.
// Called by route handlers, middleware, and the internal service API.

"use strict";

const { prisma } = require("../prisma");

/**
 * Write an audit log entry.
 *
 * @param {object} entry
 * @param {string|null}  entry.userId       - ID of the acting user (null = system)
 * @param {string|null}  entry.workspaceId  - Workspace context (if applicable)
 * @param {string}       entry.action       - e.g. "DOCUMENT_DELETED", "LOGIN_SUCCESS"
 * @param {string|null}  entry.resourceType - "Document", "Workspace", "User", etc.
 * @param {string|null}  entry.resourceId   - ID of the affected resource
 * @param {string|null}  entry.resource     - Legacy resource field (kept for backward compat)
 * @param {string}       entry.outcome      - "SUCCESS" | "FAILURE" | "PARTIAL"
 * @param {object|null}  entry.metadata     - Arbitrary extra context stored as JSON
 * @param {object|null}  entry.req          - Express request (used to extract IP + UA)
 */
async function writeAuditLog({
  userId = null,
  workspaceId = null,
  action,
  resourceType = null,
  resourceId = null,
  resource = null,
  outcome = "SUCCESS",
  metadata = null,
  req = null,
} = {}) {
  try {
    // Use req.ip (Express-resolved, respects trust proxy setting) instead of
    // X-Forwarded-For to prevent client IP spoofing.
    // Enable `app.set('trust proxy', 1)` in index.js if the server sits behind
    // a trusted reverse proxy (Nginx, AWS ALB, etc.) to correctly resolve client IPs.
    const ipAddress = req
      ? (req.ip || req.socket?.remoteAddress || null)
      : null;
    const userAgent = req ? (req.headers["user-agent"] || null) : null;

    // Normalise outcome to the enum values expected by Prisma
    const normalised = ["SUCCESS", "FAILURE", "PARTIAL"].includes(outcome)
      ? outcome
      : "SUCCESS";

    await prisma.auditLog.create({
      data: {
        userId,
        workspaceId,
        action,
        resourceType,
        resourceId: resourceId || resource,
        resource: resource || resourceId,
        ipAddress,
        userAgent,
        outcome: normalised,
        metadata,
      },
    });
  } catch (err) {
    // Audit failures must never crash the main request path.
    console.error("[AuditLog] Failed to write audit entry:", err.message);
  }
}

module.exports = { writeAuditLog };

