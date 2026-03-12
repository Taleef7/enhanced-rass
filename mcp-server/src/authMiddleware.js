// In mcp-server/src/authMiddleware.js
// Phase D: Supports both JWT Bearer tokens and API key authentication.
// API key format: Authorization: ApiKey <raw_key>

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { prisma } = require("./prisma");
const logger = require("./logger");
const { authFailuresTotal } = require("./metrics");

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  logger.warn(
    "Warning: JWT_SECRET is not set. Using an insecure default value for development."
  );
  JWT_SECRET = "insecure-default-secret-for-dev";
}

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    authFailuresTotal.inc({ reason: "no_token" });
    return res.status(401).json({ error: "Unauthorized: No token provided." });
  }

  // ── API Key authentication ─────────────────────────────────────────────────
  if (authHeader.startsWith("ApiKey ")) {
    const rawKey = authHeader.slice(7).trim();
    if (!rawKey) {
      authFailuresTotal.inc({ reason: "empty_api_key" });
      return res.status(401).json({ error: "Unauthorized: Empty API key." });
    }

    // Validate key format — must start with "rass_" prefix
    if (!rawKey.startsWith("rass_")) {
      authFailuresTotal.inc({ reason: "invalid_format" });
      return res.status(401).json({ error: "Unauthorized: Invalid API key format." });
    }

    try {
      // Fetch all non-expired keys for bcrypt comparison.
      // NOTE: This is O(n) where n = number of active API keys.
      // For high-scale deployments, consider adding an indexed keyPrefix column to
      // narrow the search before bcrypt comparison (Phase E optimisation).
      const now = new Date();
      const allKeys = await prisma.apiKey.findMany({
        where: {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { id: true, keyHash: true, userId: true },
      });

      let matchedKey = null;
      for (const k of allKeys) {
        const match = await bcrypt.compare(rawKey, k.keyHash);
        if (match) { matchedKey = k; break; }
      }

      if (!matchedKey) {
        authFailuresTotal.inc({ reason: "invalid_api_key" });
        return res.status(401).json({ error: "Unauthorized: Invalid API key." });
      }

      // Update lastUsed timestamp (fire-and-forget)
      prisma.apiKey.update({
        where: { id: matchedKey.id },
        data: { lastUsed: new Date() },
      }).catch(() => {});

      req.user = { userId: matchedKey.userId };
      req.userId = matchedKey.userId;
      req.authMethod = "api_key";
      return next();
    } catch (error) {
      logger.error("[AUTH] API key verification error:", error.message);
      return res.status(500).json({ error: "Internal server error during API key validation." });
    }
  }

  // ── JWT Bearer token authentication ───────────────────────────────────────
  if (!authHeader.startsWith("Bearer ")) {
    authFailuresTotal.inc({ reason: "no_token" });
    return res.status(401).json({ error: "Unauthorized: No token provided." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.userId = decoded.userId;
    req.authMethod = "jwt";
    next();
  } catch (error) {
    logger.info("[AUTH] JWT verification failed:", error.message);
    authFailuresTotal.inc({ reason: "invalid_jwt" });
    return res.status(401).json({ error: "Unauthorized: Invalid token." });
  }
};

module.exports = authMiddleware;
