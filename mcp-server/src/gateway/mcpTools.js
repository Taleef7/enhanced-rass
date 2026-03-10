// mcp-server/src/gateway/mcpTools.js
// MCP tool definitions: queryRASS and addDocumentToRASS.
// The McpServer instance is created here and shared with mcpTransport.js.

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { z } = require("zod");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

const server = new McpServer({
  name: "RASS-MCP-Server",
  version: "1.0.0",
});

// Tool: queryRASS — queries the knowledge base via the RASS engine
server.tool(
  "queryRASS",
  {
    query: z
      .string()
      .describe("The natural language question to ask the knowledge base."),
    top_k: z
      .optional(z.number())
      .describe("Optional. The maximum number of document chunks to return."),
  },
  async (tool_args) => {
    console.log(`[MCP Tool 'queryRASS'] Executing with args:`, tool_args);
    const rassEngineUrl = "http://rass-engine-service:8000/ask";
    const response = await axios.post(rassEngineUrl, tool_args);
    return {
      content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
    };
  }
);

// Tool: addDocumentToRASS — uploads a file from the shared volume to the embedding service
server.tool(
  "addDocumentToRASS",
  {
    source_uri: z
      .string()
      .describe(
        "The filename of the document to add, located in the shared uploads volume."
      ),
  },
  async ({ source_uri }) => {
    console.log(
      `[MCP Tool 'addDocumentToRASS'] Executing with uri:`,
      source_uri
    );
    const UPLOAD_DIR_MCP = "/usr/src/app/uploads";
    const fullPath = path.join(UPLOAD_DIR_MCP, source_uri);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found at source_uri: ${source_uri}`);
    }

    const form = new FormData();
    form.append(
      "files",
      fs.createReadStream(fullPath),
      path.basename(fullPath)
    );

    const embeddingServiceUrl = "http://embedding-service:8001/upload";
    const response = await axios.post(embeddingServiceUrl, form, {
      headers: { ...form.getHeaders() },
    });

    return {
      content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
    };
  }
);

module.exports = { server };
