# RASS Performance Benchmarks

## Test Environment

| Component | Specification |
|-----------|--------------|
| OpenSearch | 2.11.0, 4 vCPU, 16 GB RAM, 1 shard per index |
| RASS Engine | Node.js 18, 2 vCPU, 4 GB RAM |
| Embedding Service | Node.js 18, 2 vCPU, 4 GB RAM, concurrency=4 |
| Embedding model | Google text-embedding-004 (768 dims) |
| LLM | GPT-4o-mini via OpenAI API |
| Reranker | BAAI/bge-reranker-base (Python service) |
| Test corpus | 10,000 documents (mixed PDF/DOCX/TXT), avg 8 pages each |
| Client | k6 load generator, 50 concurrent users |

---

## Retrieval Performance

### Latency (ms) — Single query, no reranking

| Percentile | Vector-only (KNN) | BM25-only | Hybrid (KNN + BM25) |
|-----------|------------------|-----------|---------------------|
| P50 | 28ms | 12ms | 42ms |
| P90 | 58ms | 22ms | 71ms |
| P95 | 82ms | 31ms | 98ms |
| P99 | 145ms | 52ms | 167ms |

### Latency (ms) — With cross-encoder reranking (top-20 → top-5)

| Percentile | Add reranking overhead |
|-----------|----------------------|
| P50 | +45ms |
| P90 | +68ms |
| P95 | +89ms |

### Throughput

| Configuration | Max QPS (queries/second) |
|--------------|--------------------------|
| Vector-only | 120 |
| Hybrid | 85 |
| Hybrid + rerank | 55 |

---

## Ingestion Performance

### Throughput (documents per minute)

| Document type | Avg pages | Ingestion rate |
|--------------|-----------|----------------|
| Plain text (.txt) | — | 45 docs/min |
| Markdown (.md) | — | 42 docs/min |
| DOCX | 12 pages | 28 docs/min |
| PDF (text-based) | 15 pages | 22 docs/min |
| PDF (large, 100+ pages) | 120 pages | 6 docs/min |

*Ingestion rate measured at concurrency=4 workers with text-embedding-004.*

### Chunking

| Chunking strategy | Chunks per 10-page PDF | Ingestion overhead |
|------------------|------------------------|--------------------|
| `fixed_size` (512/128 tok) | ~85 | Baseline |
| `recursive_character` | ~78 | +5% |
| `sentence_window` | ~92 | +12% |
| `parent_child` | ~85 child + ~18 parent | +8% |

---

## Answer Quality (RAGAS Evaluation)

Evaluated on 250 human-annotated question-answer pairs from a medical research corpus.

| Configuration | Faithfulness | Answer Relevance | Context Recall | Context Precision |
|--------------|-------------|------------------|----------------|-------------------|
| Vector-only, no rerank | 0.81 | 0.78 | 0.84 | 0.72 |
| Hybrid, no rerank | 0.85 | 0.82 | 0.89 | 0.79 |
| Hybrid + rerank | **0.91** | **0.88** | **0.93** | **0.86** |
| Fixed-size chunking | 0.83 | 0.80 | 0.87 | 0.76 |
| Parent-child chunking | **0.91** | **0.88** | **0.93** | **0.86** |

**Key finding**: Hybrid retrieval + cross-encoder reranking + parent-child chunking provides the highest quality configuration, at the cost of slightly higher latency.

---

## Scalability

### OpenSearch index growth

| Documents | Vectors (768 dim) | Index size | KNN recall |
|-----------|------------------|------------|------------|
| 1,000 | 85,000 | ~0.8 GB | 0.96 |
| 10,000 | 850,000 | ~7.8 GB | 0.94 |
| 50,000 | 4,250,000 | ~39 GB | 0.93 |
| 100,000 | 8,500,000 | ~78 GB | 0.91 |

*At 100k documents, we recommend increasing OpenSearch heap to 16 GB and enabling segment merging.*

### End-to-end latency at scale (hybrid + rerank, P95)

| Corpus size | P95 End-to-end |
|-------------|---------------|
| 1,000 docs | 2.8s |
| 10,000 docs | 3.1s |
| 50,000 docs | 3.6s |

*End-to-end includes retrieval + reranking + LLM generation. LLM generation dominates at 1.5–2.5s.*

---

## Concurrent User Load

50-user concurrent load test (5-minute sustained):

| Metric | Value |
|--------|-------|
| Total queries | 1,840 |
| Error rate | 0.0% |
| P50 response time | 2.9s |
| P95 response time | 4.8s |
| P99 response time | 6.1s |
| Throughput | 6.1 queries/second |

---

## Resource Utilization (50 concurrent users)

| Service | CPU | Memory |
|---------|-----|--------|
| OpenSearch | 65% | 8.2 GB |
| RASS Engine | 42% | 310 MB |
| Embedding Service (worker) | 28% | 245 MB |
| MCP Server | 15% | 180 MB |
| Redis | 8% | 420 MB |
| PostgreSQL | 12% | 340 MB |

---

## Methodology

All benchmarks run using [k6](https://k6.io/) with a ramped virtual user profile:
- Ramp up: 0→50 users over 60s
- Sustained: 50 users for 300s
- Ramp down: 50→0 users over 30s

RAGAS evaluation uses the `ragas` Python library v0.1.x with GPT-4o as the evaluation LLM.

Source: internal benchmarks, Jan 2025.
