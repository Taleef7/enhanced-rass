# 📦 Embedding Service

This microservice is the ingestion and embedding component of the `enhanced-rass` project. It extracts text from various document types, performs **semantic chunking**, generates vector embeddings using a configured AI model provider (OpenAI or Gemini), and indexes the results into an OpenSearch database for hybrid semantic search.

This service is intended to be run as part of the Docker Compose environment defined in the root of the `enhanced-rass` repository.

For a full system overview and architecture, see [`../docs/PLANNER_AND_DIAGRAMS.md`](../docs/PLANNER_AND_DIAGRAMS.md).

---

## 🔧 Features

- **Multi-Provider Embeddings:** Supports embedding models from **OpenAI** (e.g., `text-embedding-3-small`) and **Google Gemini** (e.g., `text-embedding-004`).
- **Semantic Chunking:** Splits documents into semantically meaningful chunks for accurate retrieval.
- **Dynamic Index Management:** Automatically creates and targets OpenSearch indexes based on the embedding provider and model.
- **Multiple File Format Support:** Extracts text from `.txt`, `.md`, `.json`, `.pdf`, and `.docx` files.
- **Robust Ingestion:** Handles large documents and batch uploads.
- **Containerized:** Designed to run as a service within the main project's Docker Compose setup.

---

## 🌱 Environment Configuration

This service is configured via a `.env` file located in its directory (`embedding-service/.env`).

**To set up:**

```bash
cp embedding-service/.env.example embedding-service/.env
```

Edit `embedding-service/.env` and set your API keys and model preferences.

**Key variables:**

- `EMBEDDING_PROVIDER`: `openai` or `gemini`
- `OPENAI_API_KEY` / `GEMINI_API_KEY`: API key for your provider
- `OPENAI_EMBED_MODEL` / `GEMINI_EMBED_MODEL`: Model to use
- `OPENSEARCH_HOST`: Should be `opensearch` for Docker
- `CHUNK_SIZE`: Size (in characters) for chunking
- `EMBED_DIM`: Vector dimension (must match model)

---

## 🚀 Running the Service

This service is started automatically with:

```bash
docker compose up --build
```

Or, to run just the embedding service for development:

```bash
cd embedding-service
npm install
npm start
```

---

## 📤 Uploading Documents

Documents are uploaded via a `POST` request to:

```
POST /upload
```

**Example using curl:**

```bash
curl -F "files=@/path/to/your/document.pdf" http://localhost:8001/upload
```

**Expected Output:**

- JSON response indicating success, number of chunks created, and index name.
- Example:
  ```json
  {
    "message": "Successfully processed 1 files. Embedded and indexed 3289 semantic document chunks into 'knowledge_base_gemini_768'."
  }
  ```

**Batch Upload:**

- You can upload multiple files in one request:
  ```bash
  curl -F "files=@file1.pdf" -F "files=@file2.md" http://localhost:8001/upload
  ```

---

## 🧠 How it Works

1. **Semantic Chunking:** Uploaded documents are split into semantically meaningful chunks (default size: 4000 characters).
2. **Embedding:** Each chunk is embedded using the configured model (OpenAI or Gemini).
3. **Indexing:** Embeddings and metadata are indexed into OpenSearch under a model-specific index.
4. **Confirmation:** The service returns a summary of the operation, including the number of chunks and the index used.

---

## 🛠️ Troubleshooting & Tips

- **File Not Found:** Ensure the file path is correct and accessible from your client.
- **API Key Errors:** Double-check your `.env` file for valid API keys.
- **Index Errors:** Make sure OpenSearch is running and accessible at the configured host/port.
- **Chunk Size:** Adjust `CHUNK_SIZE` in `.env` for optimal performance based on your documents.

---

## 🔗 Related Docs

- [System Architecture & Workflows](../docs/PLANNER_AND_DIAGRAMS.md)
- [OpenSearch Documentation](https://opensearch.org/docs/)

---

For advanced configuration and developer notes, see the code comments and `.env.example`.
