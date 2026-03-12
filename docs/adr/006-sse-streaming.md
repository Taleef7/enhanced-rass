# ADR 006: Server-Sent Events (SSE) for Streaming LLM Responses

**Date:** 2025-01-15
**Status:** Accepted
**Author:** RASS Architecture Team

## Context

LLM generation is slow (1–30 seconds for a complete response). Waiting for the full response before returning it creates a poor user experience — the UI appears frozen. We need to stream tokens to the client as they are generated.

Options evaluated:
1. **Polling**: Client polls `GET /api/answers/:id` repeatedly
2. **WebSockets**: Bidirectional streaming with `ws` or `socket.io`
3. **Server-Sent Events (SSE)**: Unidirectional server-to-client streaming over HTTP
4. **gRPC streaming**: Bidirectional with protobuf

## Decision

Use **Server-Sent Events (SSE)** via `POST /api/stream-ask` returning `Content-Type: text/event-stream`.

Additionally expose `POST /api/chat/completions` in OpenAI-compatible SSE format for drop-in compatibility with existing OpenAI client libraries.

## Rationale

- **Browser native**: SSE is supported natively by all modern browsers without JavaScript libraries.
- **HTTP/1.1 compatible**: Works through existing proxies, load balancers, and CDNs without special configuration (unlike WebSockets which require upgrade support).
- **Unidirectional is sufficient**: The LLM generation flow is strictly server-to-client. WebSocket's bidirectional capability is unnecessary overhead.
- **Automatic reconnect**: Browsers implement SSE reconnection automatically (within 3s by default).
- **POST body support**: Using `fetch` with `ReadableStream` allows SSE over `POST` requests, enabling us to send a query body rather than cramming the query into a GET URL.
- **OpenAI format**: Emitting `data: {"choices":[{"delta":{"content":"..."}}]}` enables drop-in compatibility with LangChain, LibreChat, and other OpenAI-compatible clients via `POST /api/chat/completions`.

## SSE Event Protocol

```
data: {"choices":[{"delta":{"content":"token"}}]}      ← answer token
data: {"choices":[{"delta":{"custom_meta":{"type":"context","chunks":[...]}}}]}  ← retrieved chunks
data: {"choices":[{"delta":{"custom_meta":{"type":"citations","citations":[...]}}}]}  ← citations
data: [DONE]                                            ← stream complete
```

## Consequences

- **Positive**: Simple implementation (just `res.write()`); no additional server infrastructure.
- **Positive**: Works with HTTP/2 multiplexing.
- **Positive**: Abort support via `AbortController` on the client side.
- **Negative**: One-way only. If we need client-to-server mid-stream communication (e.g., interrupt generation), we need a separate HTTP call.
- **Negative**: Some corporate proxies buffer SSE responses, breaking streaming. Mitigation: set `Cache-Control: no-cache` and `X-Accel-Buffering: no`.
- **Negative**: Maximum of 6 concurrent SSE connections per domain in HTTP/1.1 (not an issue with HTTP/2).

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Polling | High latency; wasteful; complex state management |
| WebSockets | Overkill for unidirectional; proxy traversal issues |
| gRPC streaming | Requires protobuf; browser compatibility issues; overkill |
| Long-polling | Timeout complexity; less efficient than SSE |
