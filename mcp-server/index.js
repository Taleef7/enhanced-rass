// mcp-server/index.js
const express = require('express');
const axios = require('axios'); // Import axios
const app = express();

const PORT = process.env.MCP_SERVER_PORT || 8080;

app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).send('MCP Server is running.');
});

// The endpoint is now async to handle the axios call
app.post('/invoke_tool', async (req, res) => {
  const { tool_name, arguments: tool_args } = req.body;

  console.log(`[MCP Server] Received tool call for: '${tool_name}'`);
  console.log(`[MCP Server] Arguments:`, tool_args);

  if (tool_name === 'queryRASS') {
    try {
      // The URL uses the Docker service name 'rass-engine-service'
      const rassEngineUrl = 'http://rass-engine-service:8000/ask';
      console.log(`[MCP Server] Forwarding query to RASS Engine at ${rassEngineUrl}`);

      // Make the POST request to the RASS engine
      const response = await axios.post(rassEngineUrl, {
        query: tool_args.query,
        top_k: tool_args.top_k, // Forward top_k if it exists
      });

      // Send the response from the RASS engine back to the original caller
      res.status(200).json({
        tool_name: 'queryRASS',
        status: 'success',
        result: response.data, // Pass through the result from the RASS engine
      });
    } catch (error) {
      console.error('[MCP Server] Error calling RASS Engine:', error.message);
      // Forward the error status and message if available
      res.status(error.response?.status || 500).json({
        tool_name: 'queryRASS',
        status: 'error',
        error: error.response?.data?.error || 'Failed to connect to RASS Engine.',
      });
    }
  } else {
    res.status(400).json({
      error: `Tool '${tool_name}' is not supported by this server.`
    });
  }
});

app.listen(PORT, () => {
  console.log(`MCP Server listening on http://localhost:${PORT}`);
});