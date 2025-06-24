const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const {
  StreamableHTTPClientTransport,
} = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

async function uploadWarOfTheWorlds() {
  const transport = new StreamableHTTPClientTransport(
    new URL("http://localhost:8080/mcp")
  );
  const client = new Client({ name: "md-upload-client", version: "1.0.0" });

  try {
    await client.connect(transport);
    console.log("Uploading Markdown example...");

    const result = await client.callTool({
      name: "addDocumentToRASS",
      arguments: { source_uri: "markdown_example.md" },
    });

    const response = JSON.parse(result.content[0].text);
    console.log("\nUpload Result:");
    console.log(`Files processed: ${response.stats.filesProcessed}`);
    console.log(`Chunks created: ${response.stats.totalChunksCreated}`);
    console.log(`Contexts generated: ${response.stats.contextsGenerated}`);
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await client.close();
  }
}

uploadWarOfTheWorlds();
