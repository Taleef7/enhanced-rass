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

## Wire Format

All events use an **OpenAI-compatible delta envelope**:

```json
{
  "id": "<uuid>",
  "object": "chat.completion.chunk",
  "created": 1710000000,
  "model": "gpt-4o-mini",
  "choices": [
    {
      "delta": { ... }
    }
  ]
}
```

The `delta` object is the discriminated payload. Two variants exist:

| `delta` shape | Purpose |
|---|---|
| `{ "content": "<string>" }` | Incremental answer token |
| `{ "custom_meta": { "type": "<event-type>", ... } }` | Structured metadata event |

The stream ends with a literal `[DONE]` sentinel (no JSON wrapper):

```
data: [DONE]
```

---

## Event Types

### Token events — incremental answer text

Emitted for each token (word or word-fragment) as the LLM generates the answer. Concatenate all `content` values in order to reconstruct the full answer.

```
data: {"id":"a1b2...","object":"chat.completion.chunk","created":1710000000,"model":"gpt-4o-mini","choices":[{"delta":{"content":"Metformin is contraindicated in"}}]}

data: {"id":"c3d4...","object":"chat.completion.chunk","created":1710000000,"model":"gpt-4o-mini","choices":[{"delta":{"content":" patients with eGFR < 30 mL/min/1.73m²"}}]}
```

**Relevant delta fields:**
| Field | Type | Description |
|-------|------|-------------|
| `content` | `string` | One or more characters of the answer |

---

### `context` metadata event — retrieved chunks (transparency panel)

Emitted **before** the first token event, containing the raw retrieved chunks. This powers the "What RASS is thinking" transparency panel in the UI.

```
data: {"id":"e5f6...","object":"chat.completion.chunk","created":1710000000,"model":"gpt-4o-mini","choices":[{"delta":{"custom_meta":{"type":"context","chunks":[{"text":"Metformin lowers blood glucose by...","score":0.87,"documentName":"metformin-guide.pdf"}]}}}]}
```

**`custom_meta` payload:**
| Field | Type | Description |
|-------|------|-------------|
| `type` | `"context"` | Event discriminator |
| `chunks` | `array` | Array of retrieved chunk objects |
| `chunks[].text` | `string` | The chunk text passed to the LLM (first 300 chars) |
| `chunks[].score` | `float` | Retrieval score (rerank score if available, else hybrid score) |
| `chunks[].documentName` | `string` | Source document filename |

---

### `citations` metadata event — structured source citations

Emitted **once** after the final token event, containing all sources used to generate the answer.

```
data: {"id":"g7h8...","object":"chat.completion.chunk","created":1710000000,"model":"gpt-4o-mini","choices":[{"delta":{"custom_meta":{"type":"citations","citations":[{"index":1,"documentName":"metformin-guidelines.pdf","pageNumber":12,"excerpt":"Metformin is absolutely contraindicated when eGFR < 30...","relevanceScore":0.924,"grounded":true}]}}}]}
```

**`custom_meta` payload:**
| Field | Type | Description |
|-------|------|-------------|
| `type` | `"citations"` | Event discriminator |
| `citations` | `array` | Array of citation objects |
| `citations[].index` | `integer` | 1-based citation number |
| `citations[].documentName` | `string` | Original filename of the source document |
| `citations[].documentId` | `string (uuid)` | Document registry ID |
| `citations[].pageNumber` | `integer \| null` | Page number within the document (PDF only) |
| `citations[].excerpt` | `string` | The specific text excerpt retrieved and used |
| `citations[].relevanceScore` | `float` | Hybrid retrieval score (0–1, higher = more relevant) |
| `citations[].grounded` | `boolean` | `true` if the citation can be verified in the answer |

---

### `[DONE]` — stream complete

Emitted as a literal string (not JSON) as the final event. The connection closes immediately after.

```
data: [DONE]
```

---

## Complete Event Sequence

A typical successful stream has this order:

```
data: {"choices":[{"delta":{"custom_meta":{"type":"context","chunks":[...]}}}]}     ← retrieved chunks

data: {"choices":[{"delta":{"content":"Metformin"}}]}
data: {"choices":[{"delta":{"content":" is contra"}}]}
data: {"choices":[{"delta":{"content":"indicated in"}}]}
...
data: {"choices":[{"delta":{"content":"."}}]}

data: {"choices":[{"delta":{"custom_meta":{"type":"citations","citations":[...]}}}]}  ← source citations

data: [DONE]                                                                          ← stream closed
```

---

## Client Implementation

### JavaScript (fetch + ReadableStream)

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
  const lines = buffer.split('\n\n');
  buffer = lines.pop(); // Keep incomplete event in buffer

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const dataContent = line.substring(6).trim();
    if (dataContent === '[DONE]') break;

    const parsed = JSON.parse(dataContent);
    const delta = parsed.choices?.[0]?.delta;
    if (!delta) continue;

    if (delta.content) {
      // Incremental answer token
      appendToAnswer(delta.content);
    } else if (delta.custom_meta) {
      const meta = delta.custom_meta;
      if (meta.type === 'citations') {
        setCitations(meta.citations);
      } else if (meta.type === 'context') {
        setRetrievedChunks(meta.chunks);  // "What RASS is thinking" panel
      }
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
| LLM provider timeout | The LLM error is swallowed; a fallback message is appended to the token stream |
| Client disconnects | Server aborts generation immediately |
| Invalid JWT | HTTP 401 before stream starts |

---

## OpenAI-Compatible Chat Completions Stream

`POST /api/chat/completions` returns SSE in standard OpenAI delta format for drop-in compatibility with OpenAI client libraries:

```
data: {"id":"chatcmpl-...","choices":[{"delta":{"content":"Metformin"},"finish_reason":null}]}
data: {"id":"chatcmpl-...","choices":[{"delta":{},"finish_reason":"stop"}]}
data: [DONE]
```

