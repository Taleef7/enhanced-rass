# RASS Demo Video Script

**Duration**: ~5 minutes
**Format**: Screen recording with narration
**Target Audience**: Technical evaluators, CTOs, IT decision-makers

---

## Scene 1: Problem Setup (0:00 – 0:30)

**Narration:**
> "Every organisation has a document problem. Policies, research papers, contracts, manuals — thousands of documents that are nearly impossible to search effectively. When you need a specific answer, you either spend hours reading or you ask a colleague who spends hours reading. There has to be a better way."

**Screen:** Show a file explorer with hundreds of PDFs. Demonstrate a slow, irrelevant keyword search returning 200 results.

---

## Scene 2: RASS Introduction (0:30 – 1:00)

**Narration:**
> "This is RASS — Retrieval-Augmented Semantic Search. It lets you have a conversation with your documents. Ask any question in plain English, and RASS finds the most relevant passages from your knowledge base and generates a grounded, cited answer in seconds."

**Screen:** Show the RASS welcome screen at `http://localhost:3000`. Mouse over the headline "How can I help you today?"

---

## Scene 3: One-Click Setup (1:00 – 1:30)

**Narration:**
> "Setting up RASS takes less than 5 minutes. A single script starts everything — the API server, retrieval engine, embedding service, and all supporting infrastructure."

**Screen:** Show terminal running `./scripts/demo.sh`. Show Docker containers starting. Show the demo seeder completing.

---

## Scene 4: Document Upload and Ingestion (1:30 – 2:00)

**Narration:**
> "Upload any PDF, Word document, or text file. RASS processes it asynchronously — parsing the content, splitting it into chunks, embedding each chunk as a semantic vector, and indexing everything for hybrid retrieval. Watch the status badge go from Queued to Processing to Ready."

**Screen:**
1. Click the paperclip icon in the chat input
2. Select a PDF (e.g., a research paper)
3. Switch to the Document Library
4. Show the status badge changing from "Queued" → "Processing" → "Ready"

---

## Scene 5: Asking Questions (2:00 – 3:00)

**Narration:**
> "Now let's ask a question. Notice how the answer streams in real-time — we don't wait for the full response. And every claim is backed by a citation to the specific passage that supported it."

**Screen:**
1. Type: "What are the key risk factors identified in this study?"
2. Watch the streaming cursor as tokens appear
3. Hover over a citation `[1]` to see the source document and page
4. Click the sparkle icon (✨) to open the Context Panel

**Narration (during Context Panel):**
> "This is the 'What CoRAG is Thinking' panel. It shows exactly which document passages were retrieved before generation, with relevance scores. No black box — you can verify every source."

---

## Scene 6: Knowledge Bases and Team Sharing (3:00 – 3:45)

**Narration:**
> "Knowledge Bases let you organise documents by topic and share them with your team. Each Knowledge Base gets its own isolated search index, so a medical researcher's documents never appear in a legal analyst's results."

**Screen:**
1. Navigate to Knowledge Bases in the sidebar
2. Show the "RASS Demo KB" with its documents
3. Click the graph icon to show the Knowledge Graph visualization
4. Show nodes (documents) and edges (similarity relationships)
5. Navigate to Manage Members, show adding a team member

---

## Scene 7: API and Integration (3:45 – 4:15)

**Narration:**
> "CoRAG is fully API-first. The complete REST API is documented in OpenAPI 3.1 format — just navigate to /api/docs. And because RASS uses OpenAI-compatible streaming format, you can integrate it with LangChain, LibreChat, or any existing OpenAI client with a simple base URL change."

**Screen:**
1. Open `http://localhost:8080/api/docs` (Swagger UI)
2. Expand the `POST /api/stream-ask` endpoint
3. Show the request schema
4. Optionally show a `curl` command streaming a response

---

## Scene 8: Health and Operations (4:15 – 4:45)

**Narration:**
> "Production-grade operations are built in. A single health endpoint checks all dependencies — PostgreSQL, OpenSearch, Redis, the embedding service, and the retrieval engine. Prometheus metrics are available for monitoring. And the Bull Board dashboard gives real-time visibility into the ingestion queue."

**Screen:**
1. `curl http://localhost:8080/api/health | jq .` — show green status
2. Open `http://localhost:8001/admin/queues` — show Bull Board
3. Briefly show `/metrics` Prometheus output

---

## Scene 9: Summary (4:45 – 5:00)

**Narration:**
> "RASS turns your document library into a conversational knowledge base. Self-hosted, open-source, and production-ready out of the box. Try it yourself at github.com/Taleef7/enhanced-rass — setup takes less than 5 minutes."

**Screen:** Show the GitHub repository homepage. Fade to the RASS welcome screen with the animated gradient headline.

---

## Recording Notes

- Record at 1920×1080, 30fps
- Use a dark terminal theme to match the RASS UI
- Slow down mouse movements for viewer clarity
- Pause 1 second after typing each query before hitting Enter
- Add chapter markers to the video for each scene
- Add captions/subtitles for accessibility

## Post-Production

- Add RASS logo watermark in bottom-right corner
- Add chapter cards between major sections
- Background music: low-key, instrumental (no vocals)
- Colour grade to enhance contrast of dark UI

---

## Short Clips (for social media)

| Clip | Scenes | Duration | Platform |
|------|--------|----------|----------|
| "Ask your docs anything" | 5 | 45s | Twitter/X, LinkedIn |
| "5-minute setup" | 3 | 30s | Twitter/X |
| "See what AI is thinking" | 5 (Context Panel) | 30s | Twitter/X, YouTube Shorts |
| "Knowledge Graph" | 6 | 30s | LinkedIn |
