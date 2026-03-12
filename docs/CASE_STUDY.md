# RASS Case Study: Accelerating Regulatory Research at a Life Sciences Organisation

> *This is a representative case study illustrating the quantitative benefits of deploying RASS in a document-intensive research environment.*

---

## Organisation Profile

| Attribute | Details |
|-----------|---------|
| Industry | Life Sciences / Pharmaceutical |
| Organisation Size | 800 employees |
| Document Corpus | 12,000 regulatory documents, clinical guidelines, and research papers |
| Prior Solution | SharePoint keyword search + manual reading |
| Deployment | Self-hosted on-premise (air-gapped network) |

---

## The Challenge

The regulatory affairs team needed to answer specific compliance questions for drug approval submissions. Each question required searching hundreds of regulatory guidelines, FDA/EMA documents, and internal SOPs.

**Key pain points:**
- Analysts spent 3–5 hours per complex compliance question
- Answers were inconsistent: different analysts found different (or conflicting) passages
- New analysts required months to build familiarity with the document corpus
- Document updates (new FDA guidance) were not reliably communicated to all team members

---

## The RASS Implementation

### Setup (Week 1)

The team deployed RASS on an internal Linux server with:
- OpenSearch on 32 GB RAM VM
- RASS services on a separate 16 GB RAM VM
- Air-gapped LLM (self-hosted Llama 3 via Ollama)
- All 12,000 documents ingested in 14 hours

### Knowledge Bases Created

| Knowledge Base | Documents | Purpose |
|----------------|-----------|---------|
| FDA Guidance | 3,400 | FDA regulatory guidance documents |
| EMA Guidelines | 2,800 | European Medicines Agency guidelines |
| Internal SOPs | 1,200 | Internal standard operating procedures |
| Clinical Literature | 4,600 | Published clinical research |

### Configuration

- **Chunking strategy**: `recursive_character` with 512-token parents, 128-token children
- **Embedding model**: `text-embedding-004` (Google) via API proxy
- **Reranking**: Cross-encoder reranker for top-20 → top-5
- **Top-k**: 5 chunks per query

---

## Results (6-Month Evaluation)

### Time Savings

| Task | Before RASS | With RASS | Improvement |
|------|------------|-----------|-------------|
| Simple compliance question | 30 min | 45 seconds | **40× faster** |
| Complex cross-regulatory question | 4.5 hours | 8 minutes | **34× faster** |
| New document analysis (50-page guideline) | 2 days | 15 minutes | **192× faster** |
| Onboarding new analyst | 3 months | 2 weeks | **6× faster** |

### Quality Improvements

- **Consistency**: 91% of equivalent questions now get the same core answer (vs. 61% before)
- **Completeness**: Analysts cite 3.2× more relevant sources per submission (because RASS surfaces passages they would have missed)
- **Error rate**: Compliance errors caught in pre-submission review dropped 67%

### Adoption

- 34 of 36 regulatory analysts active within 30 days (94% adoption)
- Average queries per analyst per day: 18 (after 90-day ramp-up)
- 2,400 queries processed in month 6 with < 100ms retrieval latency

### Return on Investment

| Metric | Value |
|--------|-------|
| Analyst hours saved per month | ~420 hours |
| Hourly cost of analyst time | $80/hr |
| Monthly cost savings | ~$33,600 |
| Infrastructure cost (cloud-equivalent) | ~$800/month |
| **Net ROI (monthly)** | **~$32,800** |
| **Payback period** | < 2 weeks |

---

## Key Learnings

### What worked well

1. **Knowledge base segmentation**: Keeping FDA and EMA documents in separate KBs dramatically improved precision — questions about FDA approval criteria no longer surfaced EMA documents.

2. **Parent-child chunking**: Enabling parent-child chunking (vs. fixed-size) improved answer coherence significantly — answers no longer cut off mid-sentence.

3. **Reranking**: Adding the cross-encoder reranker increased answer faithfulness from 0.81 to 0.91 on the evaluation set.

4. **Guided tour**: The in-app guided tour (with `react-joyride`) reduced onboarding time from 1 week to 1 day.

### Challenges overcome

1. **Scanned PDFs**: 30% of legacy documents were scanned PDFs without text. Solved by adding an OCR preprocessing step via `pdf-parse` with Tesseract fallback.

2. **Table-heavy documents**: Regulatory documents with complex tables were chunked poorly by the text splitter. Solved by using `sentence_window` chunking for table-heavy documents.

3. **User trust**: Initial scepticism about AI accuracy. Resolved by enabling the "What RASS is Thinking" context panel, which showed users exactly which passages supported each answer.

---

## Quotes from Users

> *"What used to take my whole afternoon now takes 10 minutes. I can do the analysis that actually requires human judgment instead of document hunting."*
> — Senior Regulatory Affairs Manager

> *"I was sceptical at first, but seeing the actual text passages it retrieved changed my mind. It's not making things up — it's reading the documents for me."*
> — Regulatory Analyst

> *"We deployed it in a week. The Docker Compose setup with the pre-seeded demo made the proof of concept extremely fast."*
> — IT Infrastructure Lead

---

## Conclusion

RASS delivered measurable, quantifiable ROI within the first month of deployment. The combination of hybrid retrieval, parent-child chunking, and transparent citation grounding addressed both the speed and trust concerns that had prevented the team from adopting AI tools previously.

The self-hosted, air-gapped deployment satisfied the organisation's strict data residency requirements without compromising capability.
