# Enhanced RASS (Retrieval Augmented Semantic Search)

This project provides a complete, containerized RASS pipeline for intelligent search over documents. It consists of two primary microservices: an `embedding-service` for document ingestion and an `rass-engine-service` for querying.

The system is designed to be flexible, supporting swappable embedding and language models from different providers (e.g., OpenAI, Gemini), and is fully orchestrated with Docker for easy local setup and development.

## ✨ Core Features

- **End-to-End RASS Pipeline:** From document upload to query response.
- **Containerized Environment:** Run the entire stack (`embedding-service`, `rass-engine-service`, and OpenSearch) with a single Docker Compose command.
- **Configurable AI Models:**
  - **Embedding Service:** Supports different embedding providers (OpenAI, Gemini) and automatically manages separate, dimension-appropriate OpenSearch indexes.
  - **RASS Engine:** The LLM-based planner is configurable to use different providers and models (e.g., GPT-4o, Gemini Flash). The search term embedder is provider-aware to ensure compatibility with the target index.
- **Agentic Search Planner:** The `rass-engine-service` uses an LLM to decompose natural language queries into a multi-step search plan for more comprehensive and relevant results.
- **Multi-Format Document Support:** The `embedding-service` can process various file types, including `.txt`, `.md`, `.json`, `.pdf`, and `.docx`.

## 📂 Services

- **`embedding-service` (Port 8001):** Handles file uploads, text extraction, chunking, embedding, and indexing into the OpenSearch database.
- **`rass-engine-service` (Port 8000):** Exposes an API to accept natural language queries, uses an LLM to plan a search strategy, executes the plan against the OpenSearch index, and returns the most relevant document chunks.

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
This will build the images for both services and start all three containers (OpenSearch, `embedding-service`, `rass-engine-service`) in the background.

You can check the status of your containers with:
```bash
docker-compose ps
```

---

## ⚙️ Usage

### 1. Ingest Documents

Send a `POST` request to the `embedding-service` to upload and index your files.

```bash
# Example from within the embedding-service directory
curl -X POST http://localhost:8001/upload \
  -F "files=@./data/sample1.txt" \
  -F "files=@./data/markdown_example.md"
```
The service will create an appropriate OpenSearch index (e.g., `knowledge_base_openai_...` or `knowledge_base_gemini_...`) based on your `.env` configuration and ingest the documents.

### 2. Query Documents

Send a `POST` request to the `rass-engine-service` to ask a question. Ensure the service is configured (in its `.env` file) to target the index you populated in the previous step.

```bash
curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{
        "query": "your natural language query here",
        "top_k": 5
      }'
```

The service will return a JSON object containing the most relevant document chunks.