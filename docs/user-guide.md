# RASS User Guide

**RASS** (Retrieval-Augmented Semantic Search) is an AI-powered document intelligence platform. It lets you upload documents and have natural-language conversations with their content using hybrid semantic + keyword retrieval and LLM generation.

---

## Getting Started in 3 Steps

### 1. Create an Account

Navigate to the RASS frontend URL and click **Register**. Choose a username and password. You will be logged in automatically.

### 2. Upload Your First Document

Click the **paperclip icon** (📎) in the chat input, or open the **Document Library** (folder icon in the top bar) and click **Upload Document**.

Supported formats:
- **PDF** — text-based PDFs and scanned PDFs (with OCR via pdf-parse)
- **DOCX** — Microsoft Word documents
- **TXT** — plain text files
- **MD** — Markdown files

After uploading, you will see a progress badge on the document:
- 🔵 **Queued** — waiting to start
- 🟡 **Processing** — parsing, chunking, and embedding
- 🟢 **Ready** — indexed and searchable
- 🔴 **Failed** — error during ingestion (see Document Library for details)

### 3. Ask Questions

Once at least one document is **Ready**, type your question in the chat input and press **Enter** or click **Send**.

RASS will:
1. Retrieve the most relevant passages from your documents
2. Stream a grounded answer back to you
3. Show source citations below the answer

---

## Features

### Chat Sessions

- Create multiple independent chat sessions via **+ New Chat** in the sidebar
- Each chat session has its own message history
- Rename or delete chats from the **⋮** menu next to each chat title

### Document Library

Open the **Document Library** from the folder icon in the top bar to:

- View all uploaded documents with status badges
- Click a document name to see its **ETL provenance** (chunking strategy, embedding model, processing time)
- **Delete** a document (removes it from all indices and search results)

### Knowledge Bases

Knowledge bases let you organise related documents and share them with teammates.

1. Click **Knowledge Bases** in the left sidebar
2. Click **+ New Knowledge Base**
3. Give it a name and optional description
4. Upload documents directly into the KB

When asking questions in a chat that has a KB selected, RASS searches only within that KB. This is useful for domain-specific questions (e.g. "Medical Research KB", "Project Alpha KB").

#### Knowledge Graph

Within a Knowledge Base, click the **graph icon** to open the **Knowledge Graph** panel. This shows:
- **Nodes**: each document in the KB, sized by chunk count
- **Edges**: similarity relationships between documents

Hover over a node to see the document name and chunk count. Use zoom controls or scroll to navigate.

#### Sharing Knowledge Bases

As a KB owner, click **Manage Members** to:
- Add users by username
- Assign roles: **Owner**, **Editor** (can upload/delete docs), **Viewer** (can only search)

### Workspaces (Enterprise)

Workspaces are team-level document silos within an organisation. Contact your admin to set up an organisation and workspace.

### "What RASS Is Thinking" Panel

Click the **✨ sparkle icon** in the top bar during or after a query to open the **Context Panel**. This shows:
- Which document chunks were retrieved
- Retrieval scores for each chunk
- The raw text passed to the LLM

This transparency panel helps you understand and verify how RASS arrived at its answer.

### API Keys

Generate machine-readable API keys for programmatic access:

1. Click your **avatar** → **Profile** (or navigate to `/settings/api-keys`)
2. Click **+ New API Key**
3. Give it a name and optional expiry date
4. Copy the **raw key** immediately — it is shown only once

Use the API key in requests:
```
X-Api-Key: rass_...
```

---

## Tips for Better Answers

| Tip | Why it helps |
|-----|-------------|
| Upload focused documents | Smaller, domain-specific KBs improve retrieval precision |
| Be specific in questions | "What are the side effects of metformin?" beats "Tell me about metformin" |
| Ask follow-up questions | RASS maintains chat context — refer to "the previous answer" |
| Check citations | Click `[1]` citations to verify grounding before acting on advice |
| Use Knowledge Bases | Scoping a question to a KB prevents irrelevant results from other documents |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line in message |
| `Ctrl+/` | Focus chat input |

---

## Troubleshooting

### Document stuck in "Processing"

- Wait up to 2 minutes for large PDFs (200+ pages)
- If still stuck, check the **Document Library** for an error message
- Re-upload the document if it shows **Failed**

### "I could not find any relevant information"

- Verify the document status is **Ready** (not Queued/Processing)
- Try rephrasing the question with more specific terms
- Check that you are searching the correct Knowledge Base

### Slow responses

- Large documents with many chunks can take longer to retrieve
- Retrieval time is shown in the Context Panel (✨) per chunk score
- Contact your admin to check RASS Engine metrics (`/metrics`)

### Session expired

- RASS uses short-lived access tokens (15 min). These refresh automatically in the background.
- If you see a login prompt, your refresh token has expired (7 days). Simply log in again.

---

## Privacy and Data

- All documents are stored on your organisation's own infrastructure — RASS does not send documents to external services except the configured LLM provider (OpenAI or Google Gemini) for generation.
- Embedded vectors are stored in your private OpenSearch cluster.
- You can delete any document at any time; deletion removes all associated vectors.
- Request full data erasure via **Settings → Delete My Account** (invokes GDPR right-to-erasure).
