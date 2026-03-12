// mcp-server/src/logger.js
// Structured logger using pino. Import this instead of using console.*.
// Supports LOG_LEVEL env var (default: "info").
// Sensitive fields (Authorization headers, passwords, apiKeys) are redacted.

"use strict";

const pino = require("pino");

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "body.password",
      "body.apiKey",
      "apiKey",
      "password",
    ],
    censor: "[REDACTED]",
  },
  transport:
    process.env.PINO_PRETTY === "true"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
      : undefined,
});

module.exports = logger;
