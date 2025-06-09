// mcp-server/index.js
const express = require("express");
const axios = require("axios");
const FormData = require("form-data"); // Import FormData
const fs = require("fs"); // Import Node.js File System module
const path = require("path"); // Import path module
const app = express();

const PORT = process.env.MCP_SERVER_PORT || 8080;

app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).send("MCP Server is running.");
});

app.post("/invoke_tool", async (req, res) => {
  const { tool_name, arguments: tool_args } = req.body;

  console.log(`[MCP Server] Received tool call for: '${tool_name}'`);
  console.log(`[MCP Server] Arguments:`, tool_args);

  if (tool_name === "queryRASS") {
    try {
      const rassEngineUrl = "http://rass-engine-service:8000/ask";
      console.log(
        `[MCP Server] Forwarding query to RASS Engine at ${rassEngineUrl}`
      );

      const response = await axios.post(rassEngineUrl, {
        query: tool_args.query,
        top_k: tool_args.top_k,
      });

      res.status(200).json({
        tool_name: "queryRASS",
        status: "success",
        result: response.data,
      });
    } catch (error) {
      console.error("[MCP Server] Error calling RASS Engine:", error.message);
      res.status(error.response?.status || 500).json({
        tool_name: "queryRASS",
        status: "error",
        error:
          error.response?.data?.error || "Failed to connect to RASS Engine.",
      });
    }
  } else if (tool_name === "addDocumentToRASS") {
    const { source_uri } = tool_args;
    if (!source_uri) {
      return res
        .status(400)
        .json({ error: "Missing 'source_uri' in arguments." });
    }

    // This is the path *inside the mcp-server container* where the volume is mounted.
    const fullPath = path.join("/usr/src/app/uploads", source_uri);

    console.log(`[MCP Server] Attempting to read document from: ${fullPath}`);

    if (!fs.existsSync(fullPath)) {
      console.error(`[MCP Server] File not found at path: ${fullPath}`);
      return res
        .status(404)
        .json({ error: `File not found at source_uri: ${source_uri}` });
    }

    try {
      const form = new FormData();
      // Use the original filename for the form-data part
      form.append(
        "files",
        fs.createReadStream(fullPath),
        path.basename(fullPath)
      );

      const embeddingServiceUrl = "http://embedding-service:8001/upload";
      console.log(
        `[MCP Server] Forwarding document to Embedding Service at ${embeddingServiceUrl}`
      );

      const response = await axios.post(embeddingServiceUrl, form, {
        headers: {
          ...form.getHeaders(),
        },
      });

      console.log(
        "[MCP Server] Successfully received response from Embedding Service."
      );
      return res.status(200).json({
        tool_name: "addDocumentToRASS",
        status: "success",
        result: response.data,
      });
    } catch (error) {
      console.error(
        "[MCP Server] Error calling Embedding Service:",
        error.response?.data || error.message
      );
      return res.status(error.response?.status || 500).json({
        tool_name: "addDocumentToRASS",
        status: "error",
        error:
          error.response?.data?.error ||
          "Failed to connect to Embedding Service.",
      });
    }
  } else {
    res.status(400).json({
      error: `Tool '${tool_name}' is not supported by this server.`,
    });
  }
});

app.listen(PORT, () => {
  console.log(`MCP Server listening on http://localhost:${PORT}`);
});
