# 🤖 MCP Server Service

This service acts as an intelligent API gateway, exposing the capabilities of the `enhanced-rass` backend services as "tools" compliant with the Model Context Protocol (MCP). It allows AI agents or other clients to interact with the system using a standardized protocol.

This service is intended to be run as part of the Docker Compose environment defined in the root of the `enhanced-rass` project.

## ⚙️ Core Features

- **MCP Tool Invocation:** Provides a central `/invoke_tool` endpoint for all MCP-based interactions.
- **Service Gateway:** Intelligently routes tool calls to the appropriate backend microservice:
  - `queryRASS` calls are proxied to the `rass-engine-service`.
  - `addDocumentToRASS` calls are proxied to the `embedding-service`.
- **File Handling Proxy:** For the `addDocumentToRASS` tool, it reads a file from a shared volume and correctly streams it as `multipart/form-data` to the embedding service.
- **Containerized & Networked:** Runs as a containerized service and communicates with other backend services over the shared Docker network.

## 🔌 API Endpoint: `POST /invoke_tool`

This is the single entry point for all tool calls. It accepts a JSON payload specifying the tool name and its arguments. The service is accessible at `http://localhost:8080` when running via Docker Compose.

### Supported Tools

#### 1. `queryRASS`

Queries the knowledge base for relevant documents.

**Request:**

```json
{
  "tool_name": "queryRASS",
  "arguments": {
    "query": "What is the MCP test document?",
    "top_k": 5
  }
}
```

**Success Response:**

```json
{
  "tool_name": "queryRASS",
  "status": "success",
  "result": {
    "documents": [
      {
        "doc_id": "...",
        "file_path": "uploads/...",
        "text_chunk": "...",
        "score": 0.85
      }
    ]
  }
}
```

#### 2. `addDocumentToRASS`

Adds a new document to the knowledge base from a file accessible to the server.

**Request:**

```json
{
  "tool_name": "addDocumentToRASS",
  "arguments": {
    "source_uri": "my-file-to-upload.txt/pdf/docx/md/json"
  }
}
```

**Success Response:**

```json
{
  "tool_name": "addDocumentToRASS",
  "status": "success",
  "result": {
    "message": "Successfully processed 1 files. Embedded and indexed 3 document chunks into 'knowledge_base_gemini'."
  }
}
```

## 🛠️ Development and Deployment

### Prerequisites

- Docker and Docker Compose installed.
- Python 3.8+ installed (for local development).

### Running with Docker Compose

1. Ensure you have the `docker-compose.yml` file in the root of the `enhanced-rass` project.
2. Navigate to the root directory of the project.
3. Run the following command to start the service:
   ```bash
   docker-compose up --build
   ```
