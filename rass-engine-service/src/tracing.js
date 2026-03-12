// rass-engine-service/src/tracing.js
// Custom span helpers for key retrieval pipeline operations.
// Import and call these to instrument named spans within the pipeline.

"use strict";

const { trace, context, SpanStatusCode } = require("@opentelemetry/api");

const tracer = trace.getTracer("rass-engine-service");

/**
 * Wraps an async function in an OpenTelemetry span.
 * @param {string} spanName - Name of the span (e.g., "retrieval.embedQuery")
 * @param {object} attributes - Span attributes
 * @param {Function} fn - Async function to execute within the span
 */
async function withSpan(spanName, attributes = {}, fn) {
  return tracer.startActiveSpan(spanName, async (span) => {
    try {
      Object.entries(attributes).forEach(([k, v]) => span.setAttribute(k, v));
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  });
}

module.exports = { tracer, withSpan };
