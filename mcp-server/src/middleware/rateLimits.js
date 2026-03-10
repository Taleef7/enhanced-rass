// mcp-server/src/middleware/rateLimits.js
// Shared rate-limiter instances for Phase B routes.
// Uses express-rate-limit with in-memory store (suitable for single-instance deployments).
// For multi-instance, swap MemoryStore for Redis store.

"use strict";

const rateLimit = require("express-rate-limit");

/** 60 requests per minute per IP — general API endpoints */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

/** 10 requests per minute per IP — document deletion (more restrictive) */
const deleteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many delete requests, please try again later." },
});

/** 120 requests per minute per IP — polling endpoint (needs to be lenient) */
const statusPollLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many status requests, please slow down." },
});

/** 30 uploads per hour per IP */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Upload limit reached, please try again later." },
});

module.exports = { apiLimiter, deleteLimiter, statusPollLimiter, uploadLimiter };
