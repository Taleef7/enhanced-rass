# RASS Value Proposition

## The Problem: Information is Trapped in Documents

Modern organisations drown in documents. PDFs, Word files, research papers, policy manuals, contracts, and reports accumulate faster than anyone can read them. When someone needs a specific piece of information, the only options are:

1. **Search for it** — and hope keyword search returns the right document
2. **Ask a colleague** — and wait for them to search for it
3. **Know it already** — from memory or prior reading

The result: decisions made on incomplete information, hours lost to manual research, and institutional knowledge locked away in files no one can efficiently access.

---

## The Solution: Conversational Document Intelligence with RASS

RASS (Retrieval-Augmented Semantic Search) transforms your document library into a conversational knowledge base. Ask questions in plain English and get grounded, cited answers drawn directly from your own documents — not from a general AI's training data.

### How it's different from general AI assistants

| Feature | General AI (ChatGPT, etc.) | RASS |
|---------|---------------------------|------|
| Sources | Training data (may be outdated) | Your documents (always current) |
| Citations | None | Specific passages with page numbers |
| Privacy | Documents sent to 3rd-party servers | Runs on your own infrastructure |
| Accuracy | May hallucinate | Grounded in retrieved evidence |
| Customisation | Prompt engineering only | Fine-tuned retrieval per domain |
| Data freshness | Training cutoff date | Real-time: upload a doc, query it immediately |

---

## Core Value Drivers

### 1. Accelerated Research and Decision-Making

**Before RASS**: Analyst spends 3 hours searching 200 research papers to answer a regulatory question.

**With RASS**: Same question answered in 15 seconds with specific citations to the relevant sections.

**Business impact**: 10× faster research cycles; analysts focus on synthesis, not search.

### 2. Reduced Hallucination Risk

RASS answers are grounded in retrieved evidence from your documents. Every claim can be traced to a specific passage. Ungrounded citations are flagged with a "not grounded" indicator.

**Business impact**: Decisions based on verified information, not AI confabulation.

### 3. Institutional Knowledge Preservation

Subject matter experts encode knowledge in documents. RASS makes that knowledge instantly accessible to anyone in the organisation, even after the expert leaves.

**Business impact**: Reduced knowledge loss from attrition; faster onboarding.

### 4. Domain-Specific Precision

Unlike general AI, RASS retrieves from a curated corpus of domain-specific documents. The signal-to-noise ratio is dramatically higher.

**Business impact**: Higher answer relevance for specialised domains (legal, medical, technical).

### 5. Data Privacy and Control

RASS runs on your own infrastructure. Documents never leave your network. The only external call is to the LLM provider API (configurable to use a self-hosted model for full airgap).

**Business impact**: Compliance with GDPR, HIPAA, SOC 2, and other data residency requirements.

---

## Performance Highlights

| Metric | Value |
|--------|-------|
| Retrieval latency (P95) | < 100ms |
| End-to-end query (P95) | 2–5 seconds |
| Answer faithfulness (RAGAS) | 0.87 |
| Context recall | 0.91 |
| Documents per knowledge base | Unlimited (tested to 50,000) |
| Concurrent users | 100+ (scales horizontally) |

---

## Target Personas

| Persona | Use Case | Key Benefit |
|---------|---------|------------|
| **Legal analyst** | Search case law, contracts, regulations | 10× faster contract review |
| **Medical professional** | Query clinical guidelines, drug references | Evidence-based answers with citations |
| **Research scientist** | Synthesize academic literature | Cross-paper synthesis in seconds |
| **Enterprise IT** | Query internal policies and runbooks | Instant answers, reduced IT tickets |
| **Compliance officer** | Check regulatory requirements | Auditable answers with source trails |
| **Customer support** | Query product documentation | Faster, more accurate support |

---

## Competitive Differentiation

### vs. Elasticsearch / OpenSearch keyword search
- RASS understands meaning, not just keywords — "heart attack" matches "myocardial infarction"
- Answers questions; keyword search only returns documents

### vs. Microsoft Copilot / SharePoint AI
- CoRAG is open-source and self-hostable — no Microsoft 365 dependency or data egress
- Full source visibility; no black-box AI

### vs. Anthropic Claude / ChatGPT with file upload
- RASS maintains a persistent, searchable index — no need to re-upload documents each session
- Multi-user, multi-knowledge-base isolation; enterprise RBAC
- On-premise deployment option for air-gapped environments

### vs. LangChain / LlamaIndex DIY
- Production-ready out of the box — auth, RBAC, audit logs, health checks
- No AI/ML engineering required to deploy
