// rass-engine-service/src/otel.js
// OpenTelemetry bootstrap — import this as the FIRST line in the service entry point.
// Configures SDK with OTLP gRPC exporter and Node.js auto-instrumentations.
// Exports are sent to Jaeger (or any OTLP-compatible collector) via
// OTEL_EXPORTER_OTLP_ENDPOINT (default: http://jaeger:4317).

"use strict";

const { NodeSDK } = require("@opentelemetry/sdk-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-grpc");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { Resource } = require("@opentelemetry/resources");
const { SemanticResourceAttributes } = require("@opentelemetry/semantic-conventions");

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://jaeger:4317";

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || "rass-engine-service",
    [SemanticResourceAttributes.SERVICE_VERSION]: "1.0.0",
  }),
  traceExporter: new OTLPTraceExporter({ url: endpoint }),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
  ],
});

if (process.env.OTEL_ENABLED !== "false") {
  sdk.start();
}

module.exports = sdk;
