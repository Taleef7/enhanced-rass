# MCP Test Client

This directory contains Node.js scripts to test and validate the `mcp-server` using the official `@modelcontextprotocol/sdk`.

For a full system overview and architecture, see [`../docs/PLANNER_AND_DIAGRAMS.md`](../docs/PLANNER_AND_DIAGRAMS.md).

---

## 🎯 Purpose

- Acts as a real MCP client to ensure the `mcp-server` is fully compliant with the protocol.
- Verifies that the server can correctly handle connections, parse JSON-RPC messages, and execute tool calls as expected.
- Provides scripts for both basic and full end-to-end testing of the RASS pipeline.

---

## ⚙️ Setup

From within the `mcp-test-client` directory, install the required dependencies:

```bash
npm install
```

This will install the MCP SDK and axios.

---

## 🚀 Usage

**Ensure the main project's Docker environment is running:**

```bash
docker compose up --build
```

Then, from within the `mcp-test-client` directory, you can run the following scripts:

### 1. Basic Query Test

```bash
node run-test.js
```

- Connects to the mcp-server
- Invokes the `queryRASS` tool with a sample query
- Prints the full response received from the server to the console

### 2. Full Pipeline Test

```bash
node run-full-test.js
```

- Uploads a document using `addDocumentToRASS`
- Runs a query using `queryRASS`
- Prints all responses and results

### 3. Additional Tests

- `test-answer-quality.js`: Evaluates answer quality for a set of queries
- `test-markdown-upload.js`: Tests uploading markdown files
- `upload-md-example.js`: Uploads a sample markdown document

---

## 🧑‍💻 Expected Output

- Console output showing connection status, tool invocation, and full JSON responses from the MCP server.
- Example:
  ```json
  {
    "answer": "The context does not contain an answer to the question...",
    "source_documents": [
      { "text": "...", "initial_score": 5.34, "rerank_score": -7.76 }
    ]
  }
  ```

---

## 🛠️ Troubleshooting & Tips

- **Connection Errors:** Ensure the Docker environment is running and the MCP server is accessible at `localhost:8080`.
- **File Not Found:** For upload tests, ensure the file exists in the shared uploads volume.
- **Protocol Errors:** Check that your scripts use the correct tool names and argument structure.

---

## 🔗 Related Docs

- [System Architecture & Workflows](../docs/PLANNER_AND_DIAGRAMS.md)
- [mcp-server/README.md](../mcp-server/README.md)

---

For advanced usage and custom test scripts, see the code comments and individual script files.
