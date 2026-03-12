# SSE Streaming Protocol

`POST /api/stream-ask` returns Server-Sent Events through `mcp-server`, which proxies the stream from `rass-engine-service`.

## Request

```http
POST /api/stream-ask
Authorization: Bearer <jwt>
Content-Type: application/json
Accept: text/event-stream

{
  "query": "What are the contraindications for metformin?",
  "documents": ["report.pdf"],
  "top_k": 5
}
```

Current request body fields accepted by `mcp-server`:

- `query` required
- `documents` optional
- `top_k` optional

`chatId` is not part of the current request schema.

## Envelope Format

All JSON events use an OpenAI-style chunk envelope:

```json
{
  "id": "uuid",
  "object": "chat.completion.chunk",
  "created": 1710000000,
  "model": "gemini-2.0-flash",
  "choices": [
    {
      "delta": {}
    }
  ]
}
```

The stream terminates with:

```text
data: [DONE]
```

## Event Order

For a successful answer the event order is:

1. `context`
2. token deltas
3. `citations`
4. `[DONE]`

## Event Types

### `context`

Emitted before answer tokens.

```json
{
  "choices": [
    {
      "delta": {
        "custom_meta": {
          "type": "context",
          "chunks": [
            {
              "text": "First 300 characters of the retrieved chunk",
              "score": 0.87,
              "documentName": "metformin-guide.pdf"
            }
          ]
        }
      }
    }
  ]
}
```

Current chunk fields:

- `text`
- `score`
- `documentName`

### Token deltas

```json
{
  "choices": [
    {
      "delta": {
        "content": "Metformin "
      }
    }
  ]
}
```

Concatenate `delta.content` values in order.

### `citations`

Emitted after the final token.

```json
{
  "choices": [
    {
      "delta": {
        "custom_meta": {
          "type": "citations",
          "citations": [
            {
              "index": 1,
              "documentId": "doc_123",
              "documentName": "metformin-guidelines.pdf",
              "chunkId": "chunk_456",
              "relevanceScore": 0.924,
              "excerpt": "Metformin is contraindicated when eGFR is below 30...",
              "pageNumber": 12,
              "uploadedAt": "2026-01-01T00:00:00.000Z",
              "grounded": true
            }
          ]
        }
      }
    }
  ]
}
```

Current citation fields are produced from `rass-engine-service/src/generation/streaming.js`.

## Error Behavior

- If no documents are selected after retrieval, the stream emits a short fallback answer, then empty citations, then `[DONE]`.
- If generation fails after retrieval, the stream appends an apology message and still closes with `[DONE]`.
- Invalid auth fails before the stream starts.

## Client Notes

The frontend consumes the stream with `fetch()` and a `ReadableStream`, not `EventSource`, because the route is a `POST`.
