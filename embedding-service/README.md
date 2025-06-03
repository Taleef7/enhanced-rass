# 📦 OpenAI-Based Embedding Microservice

This microservice extracts text from uploaded documents (`.txt`, `.md`, `.json`), embeds them using OpenAI’s `text-embedding-ada-002` model, and indexes the results into OpenSearch for downstream semantic retrieval (used by the RASS engine backend).

---

## 🔧 Features

* Upload and embed up to **5 files per request**, each up to **10MB**
* Chunked text embedding with configurable max chunk size
* Auto-creation of OpenSearch index with vector KNN support (HNSW)
* JWT auth middleware
* Supports `.txt`, `.md`, and `.json` formats
* End-to-end ETL: upload → extract → embed → index

---

## 📁 Directory Structure

| Folder     | Purpose                                |
| ---------- | -------------------------------------- |
| '/uploads' | Permanent file storage (post-'multer') |
| '/temp'    | Temporary file staging via 'multer'    |

Make sure these directories are configured and writable.

---

## 🌱 Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create a `.env` file

```ini
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_API_URL=https://api.openai.com/v1
OPENAI_EMBED_MODEL=text-embedding-ada-002

# Embedding + Chunking
CHUNK_SIZE=14000
EMBED_DIM=1536

# OpenSearch
OPENSEARCH_HOST=localhost
OPENSEARCH_PORT=9200
OPENSEARCH_INDEX_NAME=redmine_index

# Upload Limits
MAX_FILE_SIZE=10485760
MAX_FILES_PER_REQUEST=5

# Local Paths
TEMP_DIR=./temp
UPLOAD_DIR=./uploads
```

### 3. Start the Server

```bash
node embeddingService.js
(or)
npm run start
```

Runs on: [http://localhost:8001](http://localhost:8001)

---

## 📤 `POST /upload`

Uploads and embeds up to 5 `.txt`, `.md`, or `.json` files in one request.

### 🧾 Example cURL

```bash
curl -X POST http://localhost:8001/upload \
  -F "files=@./data/sample.txt" \
  -F "files=@./data/sample.md"
```

### ✅ Response

```json
{
  "message": "Embedded and indexed 6 documents."
}
```

---

## 🧠 Embedding Behavior

* Splits each file into fixed-size chunks (`CHUNK_SIZE`, default 14,000 characters)
* Embeds each chunk using OpenAI
* Stores results in OpenSearch with the following metadata:

  * `doc_id`: `${filename}-${chunkIndex}`
  * `file_path`: absolute file path
  * `file_type`: `txt`, `json`, or `md`
  * `text_chunk`: raw text
  * `embedding`: 1536-dim float array

---

## 🛑 Error Handling

* Files with unsupported extensions are skipped
* Bulk indexing errors are logged and returned
* Limits on file size and number are enforced

---

## 🧪 Testing

Try uploading a file with a lot of text and verify OpenSearch has the new indexed documents:

```json
GET redmine_index/_search
```

---

## 🔐 JWT Authentication

A middleware is stubbed but commented out. To enable:

* Add JWT secret + Prisma config
* Uncomment the middleware in `/upload`

---

## 📌 Future Improvements

* Add duplicate document detection
* PDF/DOCX parser plugin
