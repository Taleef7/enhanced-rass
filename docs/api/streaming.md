# SSE Streaming Protocol

## Overview

`POST /api/stream-ask` streams the answer to a question using [Server-Sent Events (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events). The connection stays open while the RASS engine generates the answer token by token, then closes automatically.

## Connection

```http
POST /api/stream-ask
Authorization: Bearer <jwt>
Content-Type: application/json
Accept: text/event-stream

{
  "query": "What are the contraindications for metformin?",
  "chatId": "550e8400-e29b-41d4-a716-446655440000",
  "top_k": 5
}
```

The response `Content-Type` is `text/event-stream`. Each event is a single line beginning with `data:` and ending with two newlines (`\n\n`).

---

## Event Types

All events carry a JSON payload in the `data:` field. The `type` field discriminates between event kinds.

### `token` — Incremental answer text

Emitted for each token (word or word-fragment) as the LLM generates the answer. Concatenate all `content` values in order to reconstruct the full answer.

```
data: {"type":"token","content":"Metformin is contraindicated in"}

data: {"type":"token","content":" patients with eGFR < 30 mL/min/1.73m²"}
```

**Payload:**
| Field | Type | Description |
|-------|------|-------------|
| `type` | `"token"` | Event discriminator |
| `content` | `string` | One or more characters of the answer |

---

### `citations` — Structured source citations

Emitted once after the final `token` event, containing all sources used to generate the answer. Each citation includes document metadata, a text excerpt, and a grounding flag.

```
data: {"type":"citations","citations":[{"index":1,"documentName":"metformin-guidelines.pdf","pageNumber":12,"excerpt":"Metformin is absolutely contraindicated when eGFR < 30...","relevanceScore":0.924,"grounded":true}]}
```

**Citation object fields:**
| Field | Type | Description |
|-------|------|-------------|
| `index` | `integer` | 1-based citation number as referenced in the answer (e.g. `[1]`) |
| `documentName` | `string` | Original filename of the source document |
| `documentId` | `string (uuid)` | Document registry ID (use to link to provenance) |
| `pageNumber` | `integer \| null` | Page number within the document (PDF only) |
| `excerpt` | `string` | The specific text excerpt retrieved and used |
| `relevanceScore` | `float` | Hybrid retrieval score (0–1, higher = more relevant) |
| `rerankScore` | `float \| null` | Cross-encoder rerank score (present when reranking is enabled) |
| `grounded` | `boolean` | `true` if the citation can be verified in the retrieved context |

---

### `context` — Retrieved chunks (transparency panel)

Emitted before the first `token` event, containing the raw retrieved chunks. This powers the "What RASS is thinking" transparency panel in the UI.

```
data: {"type":"context","chunks":[{"text":"Metformin lowers blood glucose by...","score":0.87,"documentName":"metformin-guide.pdf"}]}
```

**Payload:**
| Field | Type | Description |
|-------|------|-------------|
| `type` | `"context"` | Event discriminator |
| `chunks` | `array` | Array of retrieved chunk objects |
| `chunks[].text` | `string` | The chunk text passed to the LLM |
| `chunks[].score` | `float` | Retrieval score |
| `chunks[].documentName` | `string` | Source document name |

---

### `done` — Stream complete

Emitted as the final event. The connection closes immediately after this event.

```
data: {"type":"done"}
```

---

### `error` — Stream-level error

Emitted if an error occurs during retrieval or generation. The connection closes after this event.

```
data: {"type":"error","message":"Failed to connect to LLM provider."}
```

**Payload:**
| Field | Type | Description |
|-------|------|-------------|
| `type` | `"error"` | Event discriminator |
| `message` | `string` | Human-readable error description |

---

## Complete Event Sequence

A typical successful stream has this event order:

```
data: {"type":"context","chunks":[...]}          ← retrieved chunks (optional)

data: {"type":"token","content":"Metformin"}
data: {"type":"token","content":" is contra"}
data: {"type":"token","content":"indicated in"}
...
data: {"type":"token","content":"."}

data: {"type":"citations","citations":[...]}     ← source citations

data: {"type":"done"}                            ← stream closed
```

---

## Client Implementation

### JavaScript (EventSource / fetch)

The frontend uses `fetch` with `ReadableStream` to consume SSE:

```js
const response = await fetch('/api/stream-ask', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({ query, chatId }),
  signal: abortController.signal,
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop(); // Keep incomplete line in buffer

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const payload = JSON.parse(line.slice(6));

    switch (payload.type) {
      case 'token':
        appendToAnswer(payload.content);
        break;
      case 'citations':
        setCitations(payload.citations);
        break;
      case 'context':
        setRetrievedChunks(payload.chunks);
        break;
      case 'done':
        setIsStreaming(false);
        break;
      case 'error':
        setError(payload.message);
        break;
    }
  }
}
```

### Aborting a stream

To cancel a running stream, call `abortController.abort()`. The server detects the client disconnect and stops generation.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| No documents ingested | Returns `citations: []` and an answer explaining no context was found |
| LLM provider timeout | Emits `{"type":"error","message":"LLM timeout"}` |
| Client disconnects | Server aborts generation immediately |
| Invalid JWT | HTTP 401 before stream starts |

---

## OpenAI-Compatible Stream

`POST /api/chat/completions` returns SSE in OpenAI delta format for drop-in compatibility with OpenAI client libraries:

```
data: {"id":"chatcmpl-...","choices":[{"delta":{"content":"Metformin"},"finish_reason":null}]}
data: {"id":"chatcmpl-...","choices":[{"delta":{},"finish_reason":"stop"}]}
data: [DONE]
```
