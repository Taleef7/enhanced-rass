# RASS Demo Guide

Welcome to the RASS demonstration! This document will help you explore all the key features.

## Getting Started

1. **Log in** with username: `demo`, password: `rass-demo-2025`
2. You'll find pre-loaded sample documents in the **"RASS Demo KB"** knowledge base
3. The guided tour will walk you through all major features

## Example Questions to Try

Try these questions to see RASS in action:

### About RAG Systems
- "What is retrieval-augmented generation?"
- "How does hybrid search work?"
- "What is parent-child chunking?"
- "What are the performance benchmarks for the system?"

### About the Architecture
- "What are the four main components of RASS?"
- "How does document ingestion work?"
- "What database does RASS use for metadata?"
- "How are knowledge bases isolated from each other?"

### Cross-Document Questions
- "Summarize the key features of RASS"
- "What are the benefits of RAG for enterprise use cases?"
- "Compare the approaches for document storage"

## Feature Walkthrough

### 1. Knowledge Graph
Click the **Hub icon** on the Knowledge Bases page to visualize how documents are connected by similarity.

### 2. "What RASS Is Thinking"
After asking a question, click the **✨ sparkle icon** in the top bar to see:
- Which chunks were retrieved
- Relevance scores
- The exact text passed to the LLM

### 3. Source Citations
Answers include inline citations like `[1]` and `[2]`. Each citation shows:
- The source document name
- A direct text excerpt
- Whether the citation is "grounded" (verifiable in the retrieved context)

### 4. API Access
The full REST API is documented at `http://localhost:8080/api/docs` (Swagger UI).

Try the streaming endpoint:
```bash
curl -X POST http://localhost:8080/api/stream-ask \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is RAG?"}' \
  --no-buffer
```

## Tips

- Ask specific questions for better results
- Check the Context Panel to verify answer grounding
- Upload your own documents via the 📎 button in the chat input
- Create a new Knowledge Base for your own documents
