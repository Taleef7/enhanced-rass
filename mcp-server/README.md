# 🤖 MCP Server Service

This service acts as an intelligent API gateway, exposing the capabilities of the `enhanced-rass` backend services as "tools" compliant with the Model Context Protocol (MCP). It allows AI agents or other clients to interact with the system using a standardized protocol.

This service is intended to be run as part of the Docker Compose environment defined in the root of the `enhanced-rass` project.

For a full system overview and architecture, see [`../docs/PLANNER_AND_DIAGRAMS.md`](../docs/PLANNER_AND_DIAGRAMS.md).

---

## ⚙️ Core Features

- **MCP Tool Invocation:** Provides a central `/mcp` endpoint that correctly parses official JSON-RPC 2.0 messages from MCP clients.
- **Service Gateway:** Intelligently routes tool calls to the appropriate backend microservice:
  - `queryRASS` calls are proxied to the `rass-engine-service`.
  - `addDocumentToRASS` calls are proxied to the `embedding-service`.
- **File Handling Proxy:** For the `addDocumentToRASS` tool, it reads a file from a shared volume and correctly streams it as `multipart/form-data` to the embedding service.
- **Containerized & Networked:** Runs as a containerized service and communicates with other backend services over the shared Docker network.

---

## 🧠 How it Works

- The MCP server exposes a single `/mcp` endpoint for all tool calls.
- It receives JSON-RPC 2.0 requests from clients (e.g., AI agents, test clients).
- Each tool call is routed to the appropriate backend service:
  - `addDocumentToRASS` → embedding-service (for document upload and indexing)
  - `queryRASS` → rass-engine-service (for querying and answer generation)
- The server handles file streaming, error handling, and response formatting.

---

## 🔌 API Endpoint: `POST /mcp`

This is the single entry point for all tool calls. It accepts a JSON-RPC 2.0 payload and is designed to work with clients using the official `@modelcontextprotocol/sdk`. The service is accessible at `http://localhost:8080` when running via Docker Compose.

### Supported Tools

#### 1. `queryRASS`

Queries the knowledge base for relevant documents and answers.

**SDK Client Usage:**

```javascript
await client.callTool({
  name: "queryRASS",
  arguments: {
    query: "What is the MCP test document?",
    top_k: 5,
  },
});
```

**Expected Output:**

- JSON response with the answer and supporting document chunks, including initial and rerank scores.
- Example (inside `result.content[0].text`):
  ```json
  {
    "answer": "The context does not contain an answer to the question...",
    "source_documents": [
      {
        "text": "There was no fresh news of the invaders from Mars.",
        "initial_score": 5.34,
        "rerank_score": -7.76
      }
    ]
  }
  ```

#### 2. `addDocumentToRASS`

Adds a new document to the knowledge base from a file accessible to the server.

**SDK Client Usage:**

```javascript
await client.callTool({
  name: "addDocumentToRASS",
  arguments: {
    source_uri: "waroftheworlds.pdf",
  },
});
```

**Expected Output:**

- JSON response indicating success, number of chunks created, and index name.
- Example (inside `result.content[0].text`):
  ```json
  {
    "message": "Successfully processed 1 files. Embedded and indexed 3289 semantic document chunks into 'knowledge_base_gemini_768'."
  }
  ```

---

## 🛠️ Troubleshooting & Tips

- **File Not Found:** Ensure the file is present in the shared uploads volume and the path is correct.
- **Backend Connectivity:** Make sure all backend services are running and accessible via Docker network.
- **JSON-RPC Errors:** Double-check your client payloads for correct structure and tool names.

---

## 🔗 Related Docs

- [System Architecture & Workflows](../docs/PLANNER_AND_DIAGRAMS.md)
- [embedding-service/README.md](../embedding-service/README.md)
- [rass-engine-service/README.md](../rass-engine-service/README.md)

---

For advanced configuration and developer notes, see the code comments and `.env.example`.
