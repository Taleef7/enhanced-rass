const { Client: OSClient } = require("@opensearch-project/opensearch");

function createOpenSearchClient(opensearchConfig) {
  const client = new OSClient({
    node: `http://${opensearchConfig.host}:${opensearchConfig.port}`,
  });

  return client;
}

async function ensureIndexExists(client, indexName, embedDim) {
  const exists = await client.indices.exists({
    index: indexName,
  });

  if (!exists.body) {
    console.log(
      `[OpenSearch] Index "${indexName}" not found. Creating with dimension: ${embedDim}...`
    );

    await client.indices.create({
      index: indexName,
      body: {
        settings: {
          index: {
            knn: true,
            "knn.algo_param.ef_search": 100,
          },
        },
        mappings: {
          properties: {
            embedding: {
              type: "knn_vector",
              dimension: embedDim,
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

    console.log(`[OpenSearch] Index "${indexName}" created.`);
  }
}

module.exports = {
  createOpenSearchClient,
  ensureIndexExists,
};
