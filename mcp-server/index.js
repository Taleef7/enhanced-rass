// mcp-server/index.js
const express = require('express');
const app = express();

const PORT = process.env.MCP_SERVER_PORT || 8080;

app.use(express.json());

// A simple root route to check if the server is alive
app.get('/', (req, res) => {
  res.status(200).send('MCP Server is running.');
});

// We will add the /invoke_tool endpoint here in the next issue
// app.post('/invoke_tool', (req, res) => { ... });

app.listen(PORT, () => {
  console.log(`MCP Server listening on http://localhost:${PORT}`);
});