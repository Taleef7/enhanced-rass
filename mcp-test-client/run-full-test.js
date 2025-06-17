// mcp-test-client/run-full-test.js
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

// The URL of the MCP server we want to test
const serverUrl = new URL("http://localhost:8080/mcp");

async function main() {
  const transport = new StreamableHTTPClientTransport(serverUrl);
  const client = new Client({
    name: "rass-full-test-client",
    version: "1.0.0",
  });

  try {
    // --- Connect to the Server ---
    console.log(`[Test Client] Connecting to MCP Server at ${serverUrl}...`);
    await client.connect(transport);
    console.log("[Test Client] Connection successful.");
    console.log("=========================================");

    // --- STEP 1: UPLOAD THE DOCUMENT ---
    console.log(
      "[Test Client] Invoking 'addDocumentToRASS' tool for 'markdown_example.md'..."
    );
    const addResult = await client.callTool({
      name: "addDocumentToRASS",
      arguments: {
        source_uri: "markdown_example.md",
      },
    });

    // The response content is a stringified JSON, so we parse it to log nicely.
    const parsedUploadResponse = JSON.parse(addResult.content[0].text);
    console.log("[Test Client] 'addDocumentToRASS' Response:");
    console.log(JSON.stringify(parsedUploadResponse, null, 2));
    console.log("-----------------------------------------");

    // --- STEP 2: QUERY THE DOCUMENT ---
    console.log(
      "[Test Client] Invoking 'queryRASS' tool with a relevant question..."
    );
    const queryResult = await client.callTool({
      name: "queryRASS",
      arguments: {
        // Ask a question relevant to the document we just uploaded
        query: "How do you format bold and italic text in markdown?",
        top_k: 2,
      },
    });

    // The response content is also a stringified JSON.
    const parsedQueryResponse = JSON.parse(queryResult.content[0].text);
    console.log("[Test Client] 'queryRASS' Response:");
    console.log(JSON.stringify(parsedQueryResponse, null, 2));
    console.log("=========================================");
  } catch (error) {
    console.error("[Test Client] An error occurred:", error.message);
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
  } finally {
    // --- Disconnect from the Server ---
    if (client.transport.state === "connected") {
      await client.close();
      console.log("[Test Client] Connection closed.");
    }
  }
}

main();
