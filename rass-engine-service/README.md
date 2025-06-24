# 🧠 RASS Engine Service

This is the intelligent querying backend of the `enhanced-rass` project. It provides an agentic, LLM-driven search layer over a vector database. The service interprets natural language queries, uses a configurable LLM to generate a multi-step search plan (**agentic planning**), executes that plan against a specified OpenSearch index (**hybrid search**), reranks results with a cross-encoder, and returns the most relevant documents.

This service is intended to be run as part of the Docker Compose environment defined in the root of the `enhanced-rass` repository.

For a full system overview and architecture, see [`../docs/PLANNER_AND_DIAGRAMS.md`](../docs/PLANNER_AND_DIAGRAMS.md).

---

## ⚙️ Core Features

- **Agentic LLM Planner:** Uses a configurable LLM provider (**OpenAI** or **Google Gemini**) to decompose user queries into a series of precise search steps.
- **Contextual Enrichment:** Expands and enriches search terms for better retrieval.
- **Provider-Aware Search:** Dynamically uses the correct embedding model (OpenAI or Gemini) to embed search terms, ensuring compatibility with the target OpenSearch index.
- **Hybrid Search:** Combines vector (semantic) and keyword search for maximum recall and precision.
- **Cross-Encoder Reranking:** Reranks top results using a cross-encoder model for semantic relevance.
- **Interleaved Multi-Entity Retrieval:** Executes a multi-step search plan and interleaves results for balanced relevance.
- **Configurable and Containerized:** All models, providers, and search parameters are configurable via environment variables, and the service is designed to run within Docker Compose.

---

## 🧰 Tech Stack

| Component              | Technology                                       |
| ---------------------- | ------------------------------------------------ |
| API Server             | Node.js + Express.js                             |
| LLM Planner            | Configurable (OpenAI GPT-4o, Gemini Flash, etc.) |
| Search Term Embeddings | Configurable (OpenAI, Gemini)                    |
| Search Engine          | OpenSearch (HNSW, KNN)                           |
| Reranker               | Cross-Encoder (py_reranker, FastAPI)             |
| API                    | REST (`/ask`) & WebSocket (`/ws/ask`)            |

---

## 🌱 Environment Configuration

This service is configured via a `.env` file located in its directory (`rass-engine-service/.env`).

**To set up:**

```bash
cp rass-engine-service/.env.example rass-engine-service/.env
```

Edit `rass-engine-service/.env` and set your API keys and model preferences.

**Key variables:**

- `LLM_PLANNER_PROVIDER`: `openai` or `gemini`
- `OPENAI_PLANNER_MODEL` / `GEMINI_PLANNER_MODEL`: Planner model to use
- `SEARCH_TERM_EMBED_PROVIDER`: `openai` or `gemini` (must match embedding-service)
- `OPENAI_API_KEY` / `GEMINI_API_KEY`: API keys
- `OPENSEARCH_HOST`: Should be `opensearch`
- `OPENSEARCH_INDEX_NAME`: Must match the index created by the embedding-service
- `EMBED_DIM`: Vector dimension (must match model)

---

## 🚀 Running the Service

This service is started automatically with:

```bash
docker compose up --build
```

Or, to run just the rass-engine-service for development:

```bash
cd rass-engine-service
npm install
npm start
```

---

## 🧑‍💻 How to Query

The main endpoint is:

```
POST /ask
```

**Request Body Example:**

```json
{
  "query": "What was the initial object that fell to Earth from Mars?",
  "top_k": 3
}
```

**Expected Output:**

- JSON response with the answer and supporting document chunks, including initial and rerank scores.
- Example:
  ```json
  {
    "answer": "The context does not contain an answer to the question about the initial object that fell to Earth from Mars.",
    "source_documents": [
      {
        "text": "There was no fresh news of the invaders from Mars.",
        "initial_score": 5.34,
        "rerank_score": -7.76
      }
    ]
  }
  ```

---

## 🧠 How it Works

1. **Agentic Planning:** The LLM planner decomposes the query into multiple search steps.
2. **Contextual Enrichment:** Search terms are expanded and enriched.
3. **Embedding:** Search terms are embedded using the configured model.
4. **Hybrid Search:** OpenSearch retrieves top-k chunks using vector and keyword search.
5. **Cross-Encoder Reranking:** The top results are reranked for semantic relevance.
6. **Answer Generation:** The LLM generates a final answer using the reranked context.
7. **Response:** The answer and sources are returned to the client.

---

## 🛠️ Troubleshooting & Tips

- **Index Mismatch:** Ensure `OPENSEARCH_INDEX_NAME` matches the index created by the embedding-service.
- **API Key Errors:** Double-check your `.env` file for valid API keys.
- **Provider Mismatch:** Both the planner and embedder must use compatible providers and models.
- **Reranker Connectivity:** Ensure the `py_reranker` service is running and accessible.

---

## 🔗 Related Docs

- [System Architecture & Workflows](../docs/PLANNER_AND_DIAGRAMS.md)
- [embedding-service/README.md](../embedding-service/README.md)

---

For advanced configuration and developer notes, see the code comments and `.env.example`.
