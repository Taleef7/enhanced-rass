// mcp-test-client/run-test.js
// --- CORRECTED REQUIRE PATHS ---
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

// The URL of the MCP server we want to test
const serverUrl = new URL("http://localhost:8080/mcp");

async function main() {
  // Create a new transport and client
  const transport = new StreamableHTTPClientTransport(serverUrl);
  const client = new Client({
    name: "rass-test-client",
    version: "1.0.0",
  });

  try {
    console.log(`[Test Client] Connecting to MCP Server at ${serverUrl}...`);
    await client.connect(transport);
    console.log("[Test Client] Connection successful.");
    console.log("-----------------------------------------");

    // --- Test 1: queryRASS ---
    console.log("[Test Client] Invoking 'queryRASS' tool...");
    const queryResult = await client.callTool({
      name: "queryRASS",
      arguments: {
        query: "What is the MCP test document?",
      },
    });
    console.log("[Test Client] 'queryRASS' Response:");
    console.log(JSON.stringify(queryResult, null, 2));
    console.log("-----------------------------------------");
  } catch (error) {
    console.error("[Test Client] An error occurred:", error.message);
  } finally {
    // Cleanly close the connection
    if (client.transport.state === "connected") {
      await client.close();
      console.log("[Test Client] Connection closed.");
    }
  }
}

main();
