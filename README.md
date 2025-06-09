# Enhanced RASS (Retrieval Augmented Semantic Search)

This project provides a complete, containerized RASS pipeline for intelligent search over documents. It consists of two primary microservices for the backend (`embedding-service`, `rass-engine-service`) and an `mcp-server` that acts as a standardized gateway.

The system is designed to be flexible, supporting swappable embedding and language models from different providers (e.g., OpenAI, Gemini), and is fully orchestrated with Docker for easy local setup and development.

## ✨ Core Features

- **End-to-End RASS Pipeline:** From document upload to query response.
- **MCP-Compliant Gateway:** Interact with the entire pipeline through a standardized Model Context Protocol server, making it ready for AI agent integration.
- **Containerized Environment:** Run the entire stack (`embedding-service`, `rass-engine-service`, `mcp-server`, and OpenSearch) with a single Docker Compose command.
- **Configurable AI Models:**
  - **Embedding Service:** Supports different embedding providers (OpenAI, Gemini) and automatically manages separate, dimension-appropriate OpenSearch indexes.
  - **RASS Engine:** The LLM-based planner is configurable to use different providers and models (e.g., GPT-4o, Gemini Flash). The search term embedder is provider-aware to ensure compatibility with the target index.
- **Agentic Search Planner:** The `rass-engine-service` uses an LLM to decompose natural language queries into a multi-step search plan for more comprehensive and relevant results.
- **Multi-Format Document Support:** The `embedding-service` can process various file types, including `.txt`, `.md`, `.json`, `.pdf`, and `.docx`.

## 📂 Services

- **`embedding-service` (Port 8001):** Handles file uploads, text extraction, chunking, embedding, and indexing into the OpenSearch database.
- **`rass-engine-service` (Port 8000):** Exposes an API to accept natural language queries, uses an LLM to plan a search strategy, executes the plan against the OpenSearch index, and returns the most relevant document chunks.
- **`mcp-server` (Port 8080):** The main entry point for agentic interaction. It exposes the backend capabilities as MCP-compliant "tools" (`queryRASS` and `addDocumentToRASS`).
- **`mcp-test-client`:** A sample Node.js client script for validating the `mcp-server` using the official MCP SDK.

---

## 🚀 Getting Started (Docker)

### Prerequisites

- [Docker](https://www.docker.com/products/docker-desktop/) installed and running.
- **WSL Users:** If you are running Docker on WSL, you must increase the `vm.max_map_count` setting required by OpenSearch. Run the following command in your WSL terminal (this resets on restart):
  ```bash
  sudo sysctl -w vm.max_map_count=262144
  ```
  To make this change permanent, add `vm.max_map_count=262144` to your `/etc/sysctl.conf` file.

### 1. Clone the Repository

```bash
git clone [https://github.com/Taleef7/enhanced-rass.git](https://github.com/Taleef7/enhanced-rass.git)
cd enhanced-rass
```

### 2. Configure Environment Variables

You need to create a `.env` file for each service based on the provided examples.

**A. For the Embedding Service:**

```bash
cp embedding-service/.env.example embedding-service/.env
```

Now, edit `embedding-service/.env` and add your `OPENAI_API_KEY` and/or `GEMINI_API_KEY`. **Do not change `OPENSEARCH_HOST` or `OPENSEARCH_PORT`**; they are correctly set for the Docker network.

**B. For the RASS Engine Service:**

```bash
cp rass-engine-service/.env.example rass-engine-service/.env
```

Now, edit `rass-engine-service/.env` and add your API keys. **Do not change `OPENSEARCH_HOST` or `OPENSEARCH_PORT`**.

### 3. Build and Run the Services

From the root of the `enhanced-rass` project, run:

```bash
docker-compose up --build -d
```

This will build the images for both services and start all four containers (OpenSearch, `embedding-service`, `rass-engine-service`, and `mcp-server`) in the background.

You can check the status of your containers with:

```bash
docker-compose ps
```

---

## ⚙️ Usage via MCP (Recommended)

The recommended way to interact with the system is through the mcp-server on port 8080.

### 1. Add a Document via MCP

First, place the file you want to add into the `embedding-service/uploads/` directory.

Then, send a `POST` request to the `/mcp` endpoint, telling it to execute the `addDocumentToRASS` tool.

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
        "jsonrpc": "2.0",
        "method": "invoke_tool",
        "params": {
          "name": "addDocumentToRASS",
          "arguments": {"source_uri": "your-file-name.txt"}
        },
        "id": 1
      }' \
  http://localhost:8080/mcp
```

### 2. Query Documents via MCP

Send a `POST` request to the `/mcp` endpoint to execute the `queryRASS` tool.

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
        "jsonrpc": "2.0",
        "method": "invoke_tool",
        "params": {
          "name": "queryRASS",
          "arguments": {
            "query": "your natural language query here",
            "top_k": 5
          }
        },
        "id": 2
      }' \
  http://localhost:8080/mcp
```

### 3. Testing with the SDK Client (Alternative to cURL)

A dedicated test client is available in the `mcp-test-client/` directory. It uses the official MCP SDK to connect to and test the server.

```bash
# Navigate to the test client directory
cd mcp-test-client

# Install dependencies (first time only)
npm install

# Run the test
node run-test.js
```

This script will connect to the `mcp-server`, invoke the `queryRASS` tool with a sample query, and print the response.
