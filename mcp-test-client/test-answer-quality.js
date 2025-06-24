const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

async function testAnswerQuality() {
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:8080/mcp")
  );
  const client = new Client({ name: "quality-test", version: "1.0.0" });

  const testQueries = [
    "How did the Martians die in War of the Worlds?",
    "What weapon did the Martians use against humans?",
    "Describe the appearance of the Martian fighting machines",
  ];

  try {
    await client.connect(transport);

    for (const query of testQueries) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`Query: ${query}`);
      console.log(`${"=".repeat(60)}`);

      const result = await client.callTool({
        name: "queryRASS",
        arguments: { query, top_k: 5 },
      });

      const response = JSON.parse(result.content[0].text);
      console.log(`\nAnswer: ${response.answer}\n`);

      console.log("Retrieved chunks:");
      response.chunks.forEach((doc, i) => {
        console.log(
          `\n${i + 1}. Score: ${
            doc.rerank_score?.toFixed(2) || doc.initial_score?.toFixed(2)
          }`
        );
        console.log(
          `   Context: ${doc.text.split("\n\n")[0].substring(0, 100)}...`
        );
      });
    }
  } finally {
    await client.close();
  }
}

testAnswerQuality();
