const axios = require("axios");
const fs = require("fs");

async function evaluatePrecisionRecall() {
  const goldenSet = JSON.parse(fs.readFileSync("./golden_set_markdown.json", "utf8"));
  let totalPrecision = 0;
  let totalRecall = 0;
  let totalRelevantRetrieved = 0;
  let totalRetrieved = 0;
  let totalRelevant = 0;

  console.log("Evaluating Precision and Recall...\n");

  for (const testCase of goldenSet.queries) {
    const response = await axios.post("http://localhost:8000/ask", {
      query: testCase.query,
      top_k: 10,
    });

    const retrievedDocs = response.data.source_documents || [];
    const retrievedIds = retrievedDocs.map((d) => d.doc_id || d._id);

    // Calculate overlap
    const relevantRetrieved = testCase.expected_docs.filter((docId) =>
      retrievedIds.includes(docId)
    ).length;

    const precision =
      retrievedIds.length > 0 ? relevantRetrieved / retrievedIds.length : 0;
    const recall =
      testCase.expected_docs.length > 0
        ? relevantRetrieved / testCase.expected_docs.length
        : 0;

    totalPrecision += precision;
    totalRecall += recall;
    totalRelevantRetrieved += relevantRetrieved;
    totalRetrieved += retrievedIds.length;
    totalRelevant += testCase.expected_docs.length;

    console.log(`Query: ${testCase.query}`);
    console.log(
      `  Retrieved: ${retrievedIds.length}, Relevant: ${testCase.expected_docs.length}`
    );
    console.log(
      `  Precision: ${precision.toFixed(2)}, Recall: ${recall.toFixed(2)}`
    );
    console.log(`  Answer: ${response.data.answer?.substring(0, 100)}...`);
    console.log();
  }

  const avgPrecision = totalPrecision / goldenSet.queries.length;
  const avgRecall = totalRecall / goldenSet.queries.length;

  console.log("=== Overall Results ===");
  console.log(`Average Precision: ${avgPrecision.toFixed(3)}`);
  console.log(`Average Recall: ${avgRecall.toFixed(3)}`);
  console.log(`Total Retrieved: ${totalRetrieved}`);
  console.log(`Total Relevant Retrieved: ${totalRelevantRetrieved}`);
  console.log(`Total Relevant in Golden Set: ${totalRelevant}`);
}

evaluatePrecisionRecall().catch(console.error);
