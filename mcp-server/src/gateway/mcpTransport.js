// mcp-server/src/gateway/mcpTransport.js
// POST /mcp — Handles MCP protocol requests via StreamableHTTPServerTransport.

const express = require("express");
const {
  StreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { server } = require("./mcpTools");

const router = express.Router();

router.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    transport.close();
    // Note: Do not close the shared McpServer instance here.
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error("[MCP Server] Error handling request:", e);
    if (!res.headersSent) {
      res.status(500).send("Internal Server Error");
    }
  }
});

module.exports = router;
