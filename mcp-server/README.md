# 🤖 MCP Server Service

This service acts as an intelligent API gateway, exposing the capabilities of the `enhanced-rass` backend services as "tools" compliant with the Model Context Protocol (MCP). It allows AI agents or other clients to interact with the system using a standardized protocol.

This service is intended to be run as part of the Docker Compose environment defined in the root of the `enhanced-rass` project.

## ⚙️ Core Features

- **MCP Tool Invocation:** Provides a central `/mcp` endpoint that correctly parses official JSON-RPC 2.0 messages from MCP clients.
- **Service Gateway:** Intelligently routes tool calls to the appropriate backend microservice:
  - `queryRASS` calls are proxied to the `rass-engine-service`.
  - `addDocumentToRASS` calls are proxied to the `embedding-service`.
- **File Handling Proxy:** For the `addDocumentToRASS` tool, it reads a file from a shared volume and correctly streams it as `multipart/form-data` to the embedding service.
- **Containerized & Networked:** Runs as a containerized service and communicates with other backend services over the shared Docker network.

## 🔌 API Endpoint: `POST /mcp`

This is the single entry point for all tool calls. It accepts a JSON-RPC 2.0 payload and is designed to work with clients using the official `@modelcontextprotocol/sdk`. The service is accessible at `http://localhost:8080` when running via Docker Compose.

### Supported Tools

#### 1. `queryRASS`

Queries the knowledge base for relevant documents.

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

**Success Response (inside result.content[0].text):**

```json
{
  "documents": [
    {
      "doc_id": "...",
      "file_path": "uploads/...",
      "text_chunk": "...",
      "score": 0.85
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
    source_uri: "my-file-to-upload.txt",
  },
});
```

**Success Response (inside result.content[0].text):**

```json
{
  "message": "Successfully processed 1 files. Embedded and indexed 3 document chunks into 'knowledge_base_gemini'."
}
```
