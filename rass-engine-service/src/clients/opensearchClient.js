// rass-engine-service/src/clients/opensearchClient.js
// OpenSearch client setup for the RASS engine.

const { Client } = require("@opensearch-project/opensearch");
const { OPENSEARCH_HOST, OPENSEARCH_PORT } = require("../config");

const osClient = new Client({
  node: `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`,
});

module.exports = { osClient };
