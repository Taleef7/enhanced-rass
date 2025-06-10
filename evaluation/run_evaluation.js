const fs = require('fs/promises');
const path = require('path');
const axios = require('axios'); // We'll use axios to call our API

// --- Configuration ---
const GOLDEN_SET_PATH = path.join(__dirname, 'golden_set.json');
const RASS_ENGINE_URL = 'http://localhost:8000/ask';
// We need to tell the RASS engine which OpenSearch index to use for our test.
// Make sure this matches the index you created for the golden set.
const RASS_ENGINE_PAYLOAD = {
  // This is a placeholder for now, we'll implement this later if needed.
  // We'll assume the rass-engine is already configured to use 'golden_set_index' via its .env file
};

// --- Helper Functions ---

/**
 * Calculates precision, recall, and f1-score.
 * @param {string[]} expected - An array of expected document IDs.
 * @param {string[]} actual - An array of actual, retrieved document IDs.
 * @returns {{precision: number, recall: number, f1: number}}
 */
function calculateMetrics(expected, actual) {
  if (!expected || expected.length === 0) {
    return { precision: 0, recall: 0, f1: 0 }; // Cannot calculate recall if nothing is expected
  }
  if (!actual || actual.length === 0) {
    return { precision: 0, recall: 0, f1: 0 }; // No results means 0 for all metrics
  }

  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);

  const truePositives = new Set([...expectedSet].filter(id => actualSet.has(id)));

  const precision = truePositives.size / actualSet.size;
  const recall = truePositives.size / expectedSet.size;
  const f1 = precision + recall === 0 ? 0 : (2 * (precision * recall)) / (precision + recall);

  return {
    precision: parseFloat(precision.toFixed(2)),
    recall: parseFloat(recall.toFixed(2)),
    f1: parseFloat(f1.toFixed(2)),
  };
}


// --- Main Execution Logic ---

async function main() {
  console.log('--- Starting RASS Evaluation Script ---');

  // 1. Load the Golden Set
  console.log(`Loading golden set from: ${GOLDEN_SET_PATH}`);
  const goldenSet = JSON.parse(await fs.readFile(GOLDEN_SET_PATH, 'utf8'));
  console.log(`Found ${goldenSet.length} evaluation cases.`);
  console.log('-----------------------------------------');

  const allScores = [];

  // 2. Loop through each evaluation case
  for (const testCase of goldenSet) {
    console.log(`\n▶️  Executing test case: ${testCase.id} (${testCase.type})`);
    console.log(`   Question: ${testCase.question}`);

    let retrievedIds = [];
    try {
      // Step 3: Call the RASS Engine API
      const response = await axios.post(RASS_ENGINE_URL, {
        query: testCase.question,
        // We can add other parameters here if needed, like top_k
      });
      
      // Step 4: Get the actual retrieved chunk IDs
      const documents = response.data.documents || [];
      retrievedIds = documents.map(doc => doc.doc_id);
      console.log(`   Retrieved ${retrievedIds.length} chunks.`);

    } catch (error) {
      console.error(`   [ERROR] API call failed for test case ${testCase.id}:`, error.message);
      // We'll score this as a complete failure
      retrievedIds = [];
    }

    // Step 5: Compare actual vs. expected and calculate metrics
    const metrics = calculateMetrics(testCase.expected_chunk_ids, retrievedIds);
    console.log(`   📊 Metrics: Precision=${metrics.precision}, Recall=${metrics.recall}, F1-Score=${metrics.f1}`);

    // Step 6: Store the scores
    allScores.push({ id: testCase.id, ...metrics });
  }

  // Step 7: Calculate and print the final report
  console.log('\n\n--- ✅ Evaluation Complete ---');
  console.log('Final Results:');
  console.table(allScores);

  const totalCases = allScores.length;
  if (totalCases > 0) {
      const avgPrecision = allScores.reduce((sum, score) => sum + score.precision, 0) / totalCases;
      const avgRecall = allScores.reduce((sum, score) => sum + score.recall, 0) / totalCases;
      const avgF1 = allScores.reduce((sum, score) => sum + score.f1, 0) / totalCases;
      
      console.log('\n--- Average Scores ---');
      console.log(`Average Precision: ${avgPrecision.toFixed(2)}`);
      console.log(`Average Recall:    ${avgRecall.toFixed(2)}`);
      console.log(`Average F1-Score:  ${avgF1.toFixed(2)}`);
      console.log('----------------------');
  }
}

main().catch(err => {
  console.error('\n[FATAL] An error occurred during the evaluation script:', err);
  process.exit(1);
});