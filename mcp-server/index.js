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
const multer = require("multer");
const authRoutes = require("./src/authRoutes.js");
const chatRoutes = require("./src/chatRoutes.js");
const authMiddleware = require("./src/authMiddleware.js");

const DEFAULT_TOP_K = Number(process.env.MCP_DEFAULT_TOP_K) || 10;
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- Express App Setup ---
const app = express();
app.use(cors()); // Use CORS middleware to allow requests from any origin
app.use(express.json({ limit: "10mb" }));
const PORT = process.env.MCP_SERVER_PORT || 8080;

// --- START: NEW LibreChat OpenAI-Compatible Endpoint ---
app.post("/api/chat/completions", async (req, res) => {
  // Extract the last user message from the request body
  const userMessages = req.body.messages.filter((m) => m.role === "user");
  const lastUserMessage = userMessages[userMessages.length - 1];

  let query;
  if (Array.isArray(lastUserMessage?.content)) {
    // Handles the expected case for text messages
    query = lastUserMessage.content[0]?.text;
  } else if (typeof lastUserMessage?.content === "string") {
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
      { query: query, top_k: DEFAULT_TOP_K }, // We can pass other params like top_k if needed
      { responseType: "stream" }
    );

    // Set the headers for our response to LibreChat to indicate a stream
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Pipe the stream from the RASS engine directly to our response object.
    response.data.on("data", (chunk) => {
      // Log the raw chunk we’re about to forward
      console.log("[Proxy → client]", chunk.toString());
    });

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

// --- START: NEW File Upload Endpoint ---
app.post(
  "/api/embed-upload",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    console.log(`[Upload Proxy] Received file: ${req.file.originalname}`);

    try {
      const form = new FormData();
      // The embedding-service expects the field name to be 'files'
      form.append("files", req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      // We must forward the userId to the embedding-service.
      form.append("userId", req.user.userId); // Get from authenticated user

      const embeddingServiceUrl = "http://embedding-service:8001/upload";
      const response = await axios.post(embeddingServiceUrl, form, {
        headers: {
          ...form.getHeaders(),
        },
        // It can take a while to embed large docs
        timeout: process.env.EMBEDDING_SERVICE_TIMEOUT || 300000, // 5 minutes
      });

      console.log(
        "[Upload Proxy] File forwarded to embedding-service successfully."
      );
      // Forward the success response from the embedding service to the client
      res.status(response.status).json(response.data);
    } catch (e) {
      console.error(
        "[Upload Proxy] Error forwarding file to embedding-service:",
        e.message
      );
      res.status(500).json({
        error: "Failed to upload and embed file.",
        details: e.message,
      });
    }
  }
);
// --- END: NEW File Upload Endpoint ---

// --- START: NEW Streaming Query Endpoint ---
app.post("/api/stream-ask", authMiddleware, async (req, res) => {
  const { query, documents } = req.body;
  const userId = req.user.userId; // Get from authenticated user

  console.log(`[Stream Proxy] Received query from user: ${userId}`);

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  try {
    const rassEngineStreamUrl = "http://rass-engine-service:8000/stream-ask";

    const response = await axios.post(
      rassEngineStreamUrl,
      { query, documents, userId },
      { responseType: "stream" }
    );

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    response.data.pipe(res);

    req.on("close", () => {
      console.log("[Stream Proxy] Client closed connection.");
      response.data.destroy();
    });
  } catch (e) {
    console.error(
      "[Stream Proxy] Error calling RASS engine stream:",
      e.message
    );
    if (!res.headersSent) {
      res
        .status(500)
        .json({ error: "Failed to process stream in RASS engine." });
    } else {
      res.end();
    }
  }
});
// --- END: NEW Streaming Query Endpoint ---

// --- START: NEW User Documents Endpoint ---
app.get("/api/user-documents", authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  
  console.log(`[User Documents] Fetching documents for user: ${userId}`);

  try {
    // Query OpenSearch to get all unique documents for this user
    // Use source field for aggregation since existing documents may not have originalFilename
    const axios = require('axios');
    const openSearchQuery = {
      size: 0,
      query: {
        bool: {
          filter: [
            { term: { "metadata.userId.keyword": userId } }
          ]
        }
      },
      aggs: {
        documents: {
          terms: {
            field: "metadata.source.keyword",
            size: 1000
          },
          aggs: {
            latest: {
              top_hits: {
                size: 1,
                sort: [{ "_score": { order: "desc" } }],
                _source: ["metadata"]
              }
            }
          }
        }
      }
    };

    // Use the environment variable for OpenSearch URL, with fallback
    const openSearchUrl = process.env.OPENSEARCH_URL || 'http://opensearch:9200';
    const indexName = process.env.OPENSEARCH_INDEX_NAME || 'knowledge_base';
    
    const response = await axios.post(`${openSearchUrl}/${indexName}/_search`, openSearchQuery, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    const documents = response.data.aggregations.documents.buckets.map(bucket => {
      const latestDoc = bucket.latest.hits.hits[0];
      const metadata = latestDoc ? latestDoc._source.metadata : {};
      
      // Use original filename if available, otherwise extract from source path
      let displayName = metadata.originalFilename;
      
      if (!displayName && metadata.source) {
        // For temp files, use a more descriptive name
        if (metadata.source.includes('temp/')) {
          displayName = `Document (${metadata.source.split('/').pop().substring(0, 8)}...)`;
        } else {
          displayName = metadata.source.split('/').pop();
        }
      }
      
      if (!displayName) {
        displayName = "Unknown Document";
      }
      
      return {
        name: displayName,
        source: metadata.source || "Unknown",
        uploadedAt: metadata.uploadedAt || new Date().toISOString(),
        chunkCount: bucket.doc_count
      };
    });

    console.log(`[User Documents] Found ${documents.length} documents for user ${userId}`);
    res.json({ documents });
  } catch (error) {
    console.error("[User Documents] Error fetching documents:", error);
    res.status(500).json({ 
      error: "Failed to fetch user documents",
      details: error.message 
    });
  }
});
// --- END: NEW User Documents Endpoint ---

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

// --- Auth Routes ---
app.use("/api/auth", authRoutes);

// --- Chat Routes (with authentication middleware) ---
app.use("/api/chats", chatRoutes);

// --- Health Check and Server Start ---
app.get("/", (req, res) => {
  res.status(200).send("RASS MCP Server is running.");
});

app.listen(PORT, () => {
  console.log(`MCP Server listening on http://localhost:${PORT}`);
});
