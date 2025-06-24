# Enhanced RASS (Retrieval Augmented Semantic Search)

This project provides a complete, containerized RASS pipeline for intelligent search over documents. It consists of two primary microservices for the backend (`embedding-service`, `rass-engine-service`) and an `mcp-server` that acts as a standardized gateway.

The system is designed to be flexible, supporting swappable embedding and language models from different providers (e.g., OpenAI, Gemini), and is fully orchestrated with Docker for easy local setup and development.

---

## 🏗️ System Overview

Enhanced RASS is a modular, agentic, and semantically-aware retrieval system. It supports:

- **Agentic Planning:** Uses LLMs to decompose queries into multi-step search plans for better coverage and relevance.
- **Semantic Chunking:** Documents are split into meaningful chunks for more accurate retrieval.
- **Contextual Enrichment:** Search terms and queries are enriched with context and expansions for improved results.
- **Hybrid Search:** Combines vector (semantic) and keyword search in OpenSearch.
- **Cross-Encoder Reranking:** Retrieved results are reranked using a cross-encoder model for semantic relevance.

For a detailed architecture and workflow diagrams, see [`docs/PLANNER_AND_DIAGRAMS.md`](docs/PLANNER_AND_DIAGRAMS.md).

---

## ✨ Core Features

- **End-to-End RASS Pipeline:** From document upload to query response.
- **MCP-Compliant Gateway:** Interact with the entire pipeline through a standardized Model Context Protocol server, making it ready for AI agent integration.
- **Containerized Environment:** Run the entire stack (`embedding-service`, `rass-engine-service`, `mcp-server`, and OpenSearch) with a single Docker Compose command.
- **Configurable AI Models:**
  - **Embedding Service:** Supports different embedding providers (OpenAI, Gemini) and automatically manages separate, dimension-appropriate OpenSearch indexes.
  - **RASS Engine:** The LLM-based planner is configurable to use different providers and models (e.g., GPT-4o, Gemini Flash). The search term embedder is provider-aware to ensure compatibility with the target index.
- **Agentic Search Planner:** The `rass-engine-service` uses an LLM to decompose natural language queries into a multi-step search plan for more comprehensive and relevant results.
- **Multi-Format Document Support:** The `embedding-service` can process various file types, including `.txt`, `.md`, `.json`, `.pdf`, and `.docx`.

---

## 📂 Services

- **`embedding-service` (Port 8001):** Handles file uploads, text extraction, semantic chunking, embedding, and indexing into the OpenSearch database.
- **`rass-engine-service` (Port 8000):** Exposes an API to accept natural language queries, uses an LLM to plan a search strategy, executes the plan against the OpenSearch index, reranks results, and returns the most relevant document chunks.
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
git clone https://github.com/Taleef7/enhanced-rass.git
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

Now, edit `rass-engine-service/.env` and add your API keys as needed.

---

### 3. Start the System

```bash
docker compose up --build
```

This will launch all services. You can monitor logs with:

```bash
docker compose logs -f
```

---

## 🧑‍💻 How to Interact

- **Add a Document:**
  - Use the MCP tool `addDocumentToRASS` (see `mcp-test-client` for examples) to upload and index documents.
- **Query the System:**
  - Use the MCP tool `queryRASS` to submit natural language questions and receive answers with supporting sources.
- **Automated Evaluation:**
  - Use the provided evaluation scripts to run batch tests and measure system performance (see `evaluation/`).

For more details on workflows, concepts, and architecture, see [`docs/PLANNER_AND_DIAGRAMS.md`](docs/PLANNER_AND_DIAGRAMS.md).

---

## 📖 Further Reading

- [PLANNER_AND_DIAGRAMS.md](docs/PLANNER_AND_DIAGRAMS.md) — Full architecture, workflows, and key concepts
- [embedding-service/README.md](embedding-service/README.md)
- [rass-engine-service/README.md](rass-engine-service/README.md)
- [mcp-server/README.md](mcp-server/README.md)
- [mcp-test-client/README.md](mcp-test-client/README.md)

---

For troubleshooting, advanced configuration, and developer notes, see the individual service READMEs and the documentation folder.
