// mcp-server/index.js
const express = require("express");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  StreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { z } = require("zod");
const cors = require("cors");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

// --- Express App Setup ---
const app = express();
app.use(cors()); // Use CORS middleware to allow requests from any origin
app.use(express.json({ limit: "10mb" }));
const PORT = process.env.MCP_SERVER_PORT || 8080;

// --- START: NEW LibreChat OpenAI-Compatible Endpoint ---
app.post("/api/chat/completions", async (req, res) => {
  // Extract the last user message from the request body
  const userMessages = req.body.messages.filter((m) => m.role === 'user');
  const lastUserMessage = userMessages[userMessages.length - 1];

  let query;
  if (Array.isArray(lastUserMessage?.content)) {
    // Handles the expected case for text messages
    query = lastUserMessage.content[0]?.text;
  } else if (typeof lastUserMessage?.content === 'string') {
    // Handles the case where content might just be a string
    query = lastUserMessage.content;
  } else {
    // Handles all other unexpected cases
    query = null;
  }

  console.log(`[LibreChat Proxy] Received query: "${query}"`);

  if (!query) {
    return res.status(400).json({ error: "No user message found in request" });
  }

  try {
    // The URL for our new streaming endpoint in the RASS engine
    const rassEngineStreamUrl = "http://rass-engine-service:8000/stream-ask";

    // Use axios to get a readable stream from the RASS engine
    const response = await axios.post(
      rassEngineStreamUrl,
      { query: query, top_k: 5 }, // We can pass other params like top_k if needed
      { responseType: "stream" }
    );

    // Set the headers for our response to LibreChat to indicate a stream
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Pipe the stream from the RASS engine directly to our response object.
    // This efficiently forwards the data as it arrives.
    response.data.pipe(res);

    // Handle the close event
    req.on("close", () => {
      console.log("[LibreChat Proxy] Client closed connection.");
      response.data.destroy(); // Clean up the stream from the RASS engine
    });
  } catch (e) {
    console.error(
      "[LibreChat Proxy] Error calling RASS engine stream:",
      e.message
    );
    if (!res.headersSent) {
      res
        .status(500)
        .json({ error: "Failed to process stream in RASS engine." });
    } else {
      res.end(); // If headers are sent, just end the stream
    }
  }
});
// --- END: NEW LibreChat OpenAI-Compatible Endpoint ---

// --- OLD Simple REST Endpoint for Web Frontend (can be removed later) ---
app.post("/simple-ask", async (req, res) => {
  const { query, top_k } = req.body;
  console.log(`[REST /simple-ask] Received query: "${query}"`);

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  try {
    // Forward the simple request directly to the rass-engine-service
    const rassEngineUrl = "http://rass-engine-service:8000/ask";
    const response = await axios.post(rassEngineUrl, { query, top_k });
    res.status(200).json(response.data);
  } catch (e) {
    console.error("[REST /simple-ask] Error calling RASS engine:", e.message);
    res.status(500).json({ error: "Failed to process query in RASS engine." });
  }
});
// --- END OLD SECTION ---

// --- Official MCP Server and Tool Definitions ---
const server = new McpServer({
  name: "RASS-MCP-Server",
  version: "1.0.0",
});

// Define the 'queryRASS' tool for official MCP clients
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

// Define the 'addDocumentToRASS' tool for official MCP clients
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

// --- Set up the MCP Transport Endpoint ---
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    transport.close();
    // Note: Do not close the main MCP server instance here, as it's shared.
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

// --- Health Check and Server Start ---
app.get("/", (req, res) => {
  res.status(200).send("RASS MCP Server is running.");
});

app.listen(PORT, () => {
  console.log(`MCP Server listening on http://localhost:${PORT}`);
});
