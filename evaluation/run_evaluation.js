// evaluation/run_evaluation.js
const fs = require("fs/promises");
const path = require("path");
const axios = require("axios");
const { spawn } = require("child_process"); // Import spawn to run external scripts

// --- Configuration ---
const GOLDEN_SET_PATH = path.join(__dirname, "golden_set_markdown.json");
const RASS_ENGINE_URL = "http://localhost:8000/ask";
const EVAL_DATA_PATH = path.join(
  __dirname,
  "ragas_evaluator",
  "eval_data.json"
);
const PYTHON_SCRIPT_PATH = path.join(
  __dirname,
  "ragas_evaluator",
  "evaluate.py"
);
// Path to the python executable within our virtual environment
const PYTHON_EXECUTABLE = path.join(
  __dirname,
  "ragas_evaluator",
  "venv",
  "bin",
  "python"
);

// --- Main Execution Logic ---

async function main() {
  console.log("--- 🚀 Starting RAGAS Evaluation Orchestrator ---");

  // 1. Load the Golden Set of questions
  console.log(`[Step 1/4] Loading golden set from: ${GOLDEN_SET_PATH}`);
  const goldenSet = JSON.parse(await fs.readFile(GOLDEN_SET_PATH, "utf8"));
  console.log(`Found ${goldenSet.length} evaluation cases.`);
  console.log("-----------------------------------------");

  // 2. Generate answers and contexts for each question
  console.log("[Step 2/4] Generating answers from RAG pipeline...");
  const ragasEvalSet = [];
  for (const testCase of goldenSet) {
    try {
      const response = await axios.post(RASS_ENGINE_URL, {
        query: testCase.question,
        top_k: 3, // Retrieve a few documents for context
      });

      const { answer, source_documents } = response.data;

      if (!answer || !source_documents) {
        throw new Error(
          "API response did not contain 'answer' or 'source_documents'"
        );
      }

      ragasEvalSet.push({
        question: testCase.question,
        answer: answer,
        // RAGAS expects 'contexts' to be an array of strings
        contexts: source_documents.map((doc) => doc.text || ""),
      });
      process.stdout.write(
        `✅ Generated answer for test case: ${testCase.id}\n`
      );
    } catch (error) {
      process.stdout.write(
        `\n❌ [ERROR] API call failed for test case ${testCase.id}: ${error.message}\n`
      );
    }
  }
  console.log("-----------------------------------------");

  // 3. Write the generated data to a file for the Python script
  console.log(
    `[Step 3/4] Writing ${ragasEvalSet.length} generated results to ${EVAL_DATA_PATH}`
  );
  await fs.writeFile(EVAL_DATA_PATH, JSON.stringify(ragasEvalSet, null, 2));
  console.log("-----------------------------------------");

  // 4. Execute the Python RAGAS script
  console.log(`[Step 4/4] Spawning Python script to run RAGAS evaluation...`);
  console.log(
    `Running: ${PYTHON_EXECUTABLE} ${PYTHON_SCRIPT_PATH} ${EVAL_DATA_PATH}`
  );

  const pythonProcess = spawn(PYTHON_EXECUTABLE, [
    PYTHON_SCRIPT_PATH,
    EVAL_DATA_PATH,
  ]);

  let stdoutData = "";
  let stderrData = "";

  pythonProcess.stdout.on("data", (data) => {
    // The python script's print() statements will be captured here
    process.stdout.write(`[python] ${data}`);
    stdoutData += data.toString();
  });

  pythonProcess.stderr.on("data", (data) => {
    process.stderr.write(`[python ERROR] ${data}`);
    stderrData += data.toString();
  });

  pythonProcess.on("close", (code) => {
    console.log(`-----------------------------------------`);
    if (code !== 0) {
      console.error(
        `\n--- ❌ Evaluation Failed: Python script exited with code ${code} ---`
      );
      console.error("Python STDERR:", stderrData);
    } else {
      console.log("\n--- ✅ RAGAS Evaluation Complete ---");
      try {
        // --- THIS IS THE FIX ---
        // This regex finds a string that starts with '{' or '[' and ends with '}' or ']'.
        // This reliably extracts the JSON block from the full output.
        const jsonMatch = stdoutData.match(/[\[\{][\s\S]*[\]\}]/);

        if (jsonMatch && jsonMatch[0]) {
          const results = JSON.parse(jsonMatch[0]);
          console.log("Final RAGAS Scores:");
          // The result is a list of score objects, which console.table handles nicely.
          console.table(results);
        } else {
          throw new Error(
            "Could not find a valid JSON object or array in the Python script output."
          );
        }
      } catch (e) {
        console.error(
          "Could not parse JSON results from Python script output.",
          e
        );
        console.log("Raw output from Python:", stdoutData);
      }
    }
  });
}

main().catch((err) => {
  console.error(
    "\n[FATAL] An error occurred during the evaluation script:",
    err
  );
  process.exit(1);
});
