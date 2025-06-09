# MCP Test Client

This directory contains a simple Node.js script to test and validate the `mcp-server` using the official `@modelcontextprotocol/sdk`.

## Purpose

The primary purpose of this client is to act as a "real" MCP client to ensure our `mcp-server` is fully compliant with the protocol. It verifies that the server can correctly handle connections, parse JSON-RPC messages, and execute tool calls as expected.

## ⚙️ Setup

From within the `mcp-test-client` directory, install the required dependencies:

```bash
npm install
```

This will install the MCP SDK and axios.

## 🚀 Usage

Ensure the main project's Docker environment is running (docker-compose up). Then, from within the mcp-test-client directory, run the test script:

```bash
node run-test.js
```

The script will:

- Connect to the mcp-server.
- Invoke the queryRASS tool with a sample query.
- Print the full response received from the server to the console.
- Close the connection.
