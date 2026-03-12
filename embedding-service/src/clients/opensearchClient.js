// embedding-service/src/clients/opensearchClient.js
// OpenSearch client setup and index initialization.

const { Client: OSClient } = require("@opensearch-project/opensearch");
const logger = require("../logger");
const {
  OPENSEARCH_HOST,
  OPENSEARCH_PORT,
  OPENSEARCH_INDEX_NAME,
  EMBED_DIM,
} = require("../config");

const openSearchClient = new OSClient({
  node: `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`,
});

async function ensureIndexExists() {
  const exists = await openSearchClient.indices.exists({
    index: OPENSEARCH_INDEX_NAME,
  });
  if (!exists.body) {
    logger.info(
      `[OpenSearch] Index "${OPENSEARCH_INDEX_NAME}" not found. Creating with dimension: ${EMBED_DIM}...`
    );
    await openSearchClient.indices.create({
      index: OPENSEARCH_INDEX_NAME,
      body: {
        settings: { index: { knn: true, "knn.algo_param.ef_search": 100 } },
        mappings: {
          properties: {
            embedding: {
              type: "knn_vector",
              dimension: EMBED_DIM,
              method: {
                name: "hnsw",
                space_type: "l2",
                engine: "faiss",
                parameters: {
                  ef_construction: 256,
                  m: 48,
                },
              },
            },
          },
        },
      },
    });
    logger.info(`[OpenSearch] Index "${OPENSEARCH_INDEX_NAME}" created.`);
  }
}

module.exports = { openSearchClient, ensureIndexExists };
