// mcp-server/index.js
const express = require("express");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  StreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { z } = require("zod");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

const server = new McpServer({
  name: "RASS-MCP-Server",
  version: "1.0.0",
});

// Define the 'queryRASS' tool
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
    // CORRECTED RETURN: The content type must be 'text', and the data is stringified.
    return {
      content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
    };
  }
);

// Define the 'addDocumentToRASS' tool
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

    // CORRECTED RETURN: The content type must be 'text', and the data is stringified.
    return {
      content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
    };
  }
);

// --- Set up the Express App and MCP Transport ---

const app = express();
app.use(express.json({ limit: "10mb" }));
const PORT = process.env.MCP_SERVER_PORT || 8080;

app.get("/", (req, res) => {
  res.status(200).send("MCP Server is running.");
});

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    transport.close();
    server.close();
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

app.listen(PORT, () => {
  console.log(`MCP Server listening on http://localhost:${PORT}`);
});
