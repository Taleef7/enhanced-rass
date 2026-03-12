// mcp-server/src/permissions.js
// Phase D: Defines the RBAC permission model for RASS.
// WorkspaceMember roles map to allowed operations.

"use strict";

const PERMISSIONS = {
  DOCUMENT_READ:    "document:read",
  DOCUMENT_CREATE:  "document:create",
  DOCUMENT_DELETE:  "document:delete",
  WORKSPACE_READ:   "workspace:read",
  WORKSPACE_MANAGE: "workspace:manage",
  ORG_ADMIN:        "org:admin",
};

const ROLE_PERMISSIONS = {
  VIEWER: [
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.WORKSPACE_READ,
  ],
  EDITOR: [
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.WORKSPACE_READ,
  ],
  ADMIN: [
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.DOCUMENT_DELETE,
    PERMISSIONS.WORKSPACE_READ,
    PERMISSIONS.WORKSPACE_MANAGE,
  ],
};

module.exports = { PERMISSIONS, ROLE_PERMISSIONS };
