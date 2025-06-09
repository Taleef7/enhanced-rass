# 📦 Embedding Service

This microservice is the ingestion component of the `enhanced-rass` project. It extracts text from various document types, generates vector embeddings using a configured AI model provider (OpenAI or Gemini), and indexes the results into an OpenSearch database.

This service is intended to be run as part of the Docker Compose environment defined in the root of the `enhanced-rass` repository.

---

## 🔧 Features

- **Multi-Provider Embeddings:** Natively supports embedding models from both **OpenAI** (e.g., `text-embedding-3-small`) and **Google Gemini** (e.g., `text-embedding-004`).
- **Dynamic Index Management:** Automatically creates and targets OpenSearch indexes based on the chosen embedding provider and model (e.g., `knowledge_base_openai_...` or `knowledge_base_gemini_...`), ensuring separation of data.
- **Multiple File Format Support:** Extracts text from `.txt`, `.md`, `.json`, `.pdf`, and `.docx` files.
- **Robust Ingestion:** Chunks large documents into appropriately sized pieces for embedding models.
- **Containerized:** Designed to run as a service within the main project's Docker Compose setup.

---

## 🌱 Environment Configuration

This service is configured via a `.env` file located in its directory (`embedding-service/.env`). You should create this file from `.env.example`.

Key variables:

- `EMBEDDING_PROVIDER`: Set to `openai` or `gemini` to select the embedding model provider.
- `OPENAI_API_KEY` / `GEMINI_API_KEY`: The API key for your chosen provider.
- `OPENAI_EMBED_MODEL` / `GEMINI_EMBED_MODEL`: The specific model to use for embeddings.
- `OPENSEARCH_HOST`: Should be set to `opensearch` to connect to the OpenSearch container within the Docker network.
- `CHUNK_SIZE`: The size (in characters) to split large documents into.
- `EMBED_DIM`: The vector dimension of the chosen embedding model (e.g., `1536` for OpenAI's `text-embedding-3-small`, `768` for Gemini's `text-embedding-004`).

**Example `.env`:**

```ini
# Provider Selection: "openai" or "gemini"
EMBEDDING_PROVIDER=gemini

# Provider-specific settings
OPENAI_API_KEY=sk-...
OPENAI_EMBED_MODEL=text-embedding-3-small

GEMINI_API_KEY=...
GEMINI_EMBED_MODEL=text-embedding-004

# OpenSearch Configuration (for Docker Compose network)
OPENSEARCH_HOST=opensearch
OPENSEARCH_PORT=9200
# Note: The final index name is dynamically generated based on the provider and model.

# Embedding & File Config
CHUNK_SIZE=4000
EMBED_DIM=768 # IMPORTANT: Must match the dimension of your selected model
MAX_FILE_SIZE=10485760
MAX_FILES_PER_REQUEST=10
```

---

## 🚀 Running the Service

This service is not intended to be run standalone. Please refer to the **main `README.md`** in the root of the `enhanced-rass` repository for instructions on how to start the entire application stack using `docker-compose up`.

---

## 📤 API Endpoint: `POST /upload`

Uploads and embeds one or more documents. The service is accessible at `http://localhost:8001` when running via Docker Compose.

**Note:** This endpoint is for direct interaction with the embedding service. For most use cases, documents should be added via the `addDocumentToRASS` tool through the `mcp-server`, which acts as a gateway to this service.

### Example cURL

```bash
# Uploads two files to be processed
curl -X POST http://localhost:8001/upload \
  -F "files=@./data/my-document.pdf" \
  -F "files=@./data/another-document.docx"
```

### ✅ Success Response

```json
{
  "message": "Successfully processed 2 files. Embedded and indexed 15 document chunks into 'knowledge_base_gemini_text-embedding-004'."
}
```
