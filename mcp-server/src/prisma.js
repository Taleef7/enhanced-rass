// mcp-server/src/prisma.js
// Single shared PrismaClient instance for the entire mcp-server process.
// All modules must import from here instead of instantiating their own client
// to avoid exhausting the Postgres connection pool.

"use strict";

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

module.exports = { prisma };
