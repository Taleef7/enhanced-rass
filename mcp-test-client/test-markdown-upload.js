const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

const serverUrl = new URL("http://localhost:8080/mcp");

async function testMarkdownUpload() {
  const transport = new StreamableHTTPClientTransport(serverUrl);
  const client = new Client({
    name: "rass-markdown-test-client",
    version: "1.0.0",
  });

  try {
    console.log(`[Test Client] Connecting to MCP Server at ${serverUrl}...`);
    await client.connect(transport);
    console.log("[Test Client] Connection successful.");
    console.log("=========================================\n");

    // STEP 1: Upload the markdown document
    console.log("[Test Client] Uploading 'markdown_example.md'...");
    const addResult = await client.callTool({
      name: "addDocumentToRASS",
      arguments: {
        source_uri: "markdown_example.md",
      },
    });

    const parsedUploadResponse = JSON.parse(addResult.content[0].text);
    console.log("[Test Client] Upload Response:");
    console.log(JSON.stringify(parsedUploadResponse, null, 2));
    console.log("\n-----------------------------------------\n");

    // Wait a moment for indexing
    console.log("[Test Client] Waiting 2 seconds for indexing...");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // STEP 2: Query the uploaded document
    console.log(
      "[Test Client] Querying for Markdown formatting information..."
    );
    const queryResult = await client.callTool({
      name: "queryRASS",
      arguments: {
        query:
          "What text formatting options does Markdown support for bold and italic text?",
        top_k: 3,
      },
    });

    const parsedQueryResponse = JSON.parse(queryResult.content[0].text);
    console.log("[Test Client] Query Response:");
    console.log(JSON.stringify(parsedQueryResponse, null, 2));

    // Show just the retrieved chunks for easier reading
    console.log("\n[Test Client] Retrieved Chunks:");
    if (parsedQueryResponse.chunks) {
      parsedQueryResponse.chunks.forEach((chunk, index) => {
        console.log(`\n--- Chunk ${index + 1} ---`);
        console.log(`Source: ${chunk.source}`);
        console.log(`Score: ${chunk.score}`);
        console.log(`Text: ${chunk.text_chunk.substring(0, 200)}...`);
      });
    }

    console.log("\n=========================================");
  } catch (error) {
    console.error("[Test Client] An error occurred:", error.message);
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
  } finally {
    if (client && client.transport && client.transport.state === "connected") {
      await client.close();
      console.log("[Test Client] Connection closed.");
    }
  }
}

testMarkdownUpload();
