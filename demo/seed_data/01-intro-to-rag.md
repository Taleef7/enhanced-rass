# Introduction to Retrieval-Augmented Generation (RAG)

Retrieval-Augmented Generation (RAG) is an AI architecture that combines information retrieval with language model generation to produce more accurate and grounded responses.

## How RAG Works

1. **Document Ingestion**: Source documents are split into chunks and converted into vector embeddings using an embedding model (e.g., OpenAI text-embedding-004 or Google text-embedding-004).

2. **Vector Storage**: These embeddings are stored in a vector database (e.g., OpenSearch, Pinecone, Weaviate) alongside the original text.

3. **Query Processing**: When a user asks a question, the query is also embedded and used to search for the most similar document chunks using approximate nearest-neighbor (ANN) search.

4. **Context Assembly**: The top-k retrieved chunks are assembled into a context prompt.

5. **LLM Generation**: A large language model (LLM) receives the context + question and generates a grounded, cited answer.

## Key Benefits of RAG

- **Reduced hallucination**: The LLM generates from retrieved evidence, not from training memory alone
- **Up-to-date knowledge**: Documents can be updated without retraining the LLM
- **Source attribution**: Every answer can cite the specific document and page that supported it
- **Domain specificity**: Organisations can use their own proprietary documents

## Hybrid Retrieval

Modern RAG systems use **hybrid retrieval** that combines:

- **Vector/semantic search**: Finds conceptually similar content even without exact keyword matches
- **BM25 keyword search**: Finds exact term matches with strong precision

The combination (using Reciprocal Rank Fusion or learned weights) outperforms either method alone by 10-30% on standard retrieval benchmarks.

## RASS Architecture

RASS (Retrieval-Augmented Semantic Search) implements production-grade RAG with:

- **Parent-child chunking**: Small child chunks for precise retrieval, large parent chunks for rich LLM context
- **Multi-stage pipeline**: HyDE query expansion → embedding → hybrid search → reranking → generation
- **SSE streaming**: Real-time answer streaming via Server-Sent Events
- **Multi-tenant isolation**: Per-knowledge-base OpenSearch indices for data security

## Performance Benchmarks

On a dataset of 1,000 medical research papers:
- Retrieval latency (P95): 85ms
- End-to-end answer latency (P95): 3.2 seconds
- Answer faithfulness (RAGAS): 0.87
- Context recall: 0.91

## Use Cases

RAG systems are particularly effective for:
- **Enterprise knowledge management**: Query internal policies, procedures, and reports
- **Legal research**: Search case law and regulatory documents
- **Medical reference**: Query clinical guidelines and drug information
- **Customer support**: Answer questions from product documentation
- **Research assistance**: Synthesize findings from academic papers
