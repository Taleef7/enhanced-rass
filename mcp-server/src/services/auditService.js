// mcp-server/src/services/auditService.js
// Writes structured audit events to the AuditLog table in Postgres.
// Called by route handlers and the internal service API.

"use strict";

const { prisma } = require("../prisma");

/**
 * Write an audit log entry.
 *
 * @param {object} entry
 * @param {string|null}  entry.userId   - ID of the user triggering the action (null for system)
 * @param {string}       entry.action   - e.g. "DOCUMENT_UPLOADED", "DOCUMENT_DELETED", "SEARCH"
 * @param {string|null}  entry.resource - ID of the affected resource (documentId, kbId, …)
 * @param {string}       entry.outcome  - "SUCCESS" | "FAILURE"
 * @param {object|null}  entry.metadata - Arbitrary extra context stored as JSON
 */
async function writeAuditLog({ userId = null, action, resource = null, outcome, metadata = null }) {
  try {
    await prisma.auditLog.create({
      data: { userId, action, resource, outcome, metadata },
    });
  } catch (err) {
    // Audit failures must never crash the main request path.
    console.error("[AuditLog] Failed to write audit entry:", err.message);
  }
}

module.exports = { writeAuditLog };
