/**********************************************************************
 * embeddingService - Node.js Microservice for Text Embeddings
 *
 * Enhanced with Contextual Retrieval:
 * 1. Reads the full text of a document
 * 2. Splits it into chunks using semantic similarity
 * 3. For each chunk, generates contextual summary using LLM
 * 4. Prepends context to create enriched chunks
 * 5. Embeds the contextualized chunks into OpenSearch
 *********************************************************************/

const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const sanitize = require("sanitize-filename");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const fs = require("fs-extra");
const path = require("path");
const cors = require("cors");

// Document Loaders & Parsers
const { TextLoader } = require("langchain/document_loaders/fs/text");
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const { DocxLoader } = require("@langchain/community/document_loaders/fs/docx");

// Provider SDKs
const { OpenAIEmbeddings, ChatOpenAI } = require("@langchain/openai");
const {
  GoogleGenerativeAIEmbeddings,
  ChatGoogleGenerativeAI,
} = require("@langchain/google-genai");
const {
  OpenSearchVectorStore,
} = require("@langchain/community/vectorstores/opensearch");
const { Client: OSClient } = require("@opensearch-project/opensearch");

/**************** Load ENV ****************/
dotenv.config();

const {
  LLM_PROVIDER = "gemini",
  EMBEDDING_PROVIDER = "gemini",
  OPENAI_API_KEY,
  GEMINI_API_KEY,
  OPENSEARCH_HOST = "localhost",
  OPENSEARCH_PORT = "9200",
  OPENSEARCH_INDEX_NAME = "knowledge_base",
  TEMP_DIR = "./temp",
  UPLOAD_DIR = "./uploads",
  PORT = 8001,
  CHUNK_SIZE = 1000,
  CHUNK_OVERLAP = 200,
  EMBED_DIM = 768,
  CONTEXT_GENERATION_DELAY_MS = "100",
} = process.env;

const ENABLE_CONTEXT_GENERATION =
  String(process.env.ENABLE_CONTEXT_GENERATION).toLowerCase().trim() === "true";

/**************** Initialize Clients ****************/
const app = express();
app.use(cors());

// OpenSearch Client
const openSearchClient = new OSClient({
  node: `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`,
});

// Generative LLM for Contextualization
let llm;
console.log(
  `[Initialization] Initializing LLM for Context Generation via provider: ${LLM_PROVIDER}`
);
if (LLM_PROVIDER === "gemini") {
  llm = new ChatGoogleGenerativeAI({
    apiKey: GEMINI_API_KEY,
    model: "gemini-2.0-flash-lite",
  });
} else {
  llm = new ChatOpenAI({
    apiKey: OPENAI_API_KEY,
    model: "gpt-4o-mini",
  });
}

// Embedding Model
let embeddings;
console.log(
  `[Initialization] Initializing Embedding Model via provider: ${EMBEDDING_PROVIDER}`
);
if (EMBEDDING_PROVIDER === "gemini") {
  embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: GEMINI_API_KEY,
    modelName: "text-embedding-004",
  });
} else {
  embeddings = new OpenAIEmbeddings({
    apiKey: OPENAI_API_KEY,
    model: "text-embedding-3-small",
  });
}

/**************** Middleware & Setup ***************/
fs.ensureDirSync(UPLOAD_DIR);
fs.ensureDirSync(TEMP_DIR);
app.use(express.json());
app.use(cookieParser());
const upload = multer({ dest: TEMP_DIR });

/**************** Helper Functions ****************/

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureIndexExists() {
  try {
    const exists = await openSearchClient.indices.exists({
      index: OPENSEARCH_INDEX_NAME,
    });
    if (!exists.body) {
      console.log(
        `[OpenSearch] Index '${OPENSEARCH_INDEX_NAME}' not found. Creating with EMBED_DIM: ${EMBED_DIM}...`
      );
      await openSearchClient.indices.create({
        index: OPENSEARCH_INDEX_NAME,
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
                dimension: EMBED_DIM,
              },
              metadata: {
                type: "object",
                properties: {
                  source: { type: "keyword" },
                  chunkIndex: { type: "integer" },
                  totalChunks: { type: "integer" },
                  generatedContext: { type: "text" },
                  originalChunkText: { type: "text" },
                },
              },
            },
          },
        },
      });
      console.log(
        `[OpenSearch] Index '${OPENSEARCH_INDEX_NAME}' created successfully.`
      );
    } else {
      console.log(
        `[OpenSearch] Index '${OPENSEARCH_INDEX_NAME}' already exists.`
      );
    }
  } catch (error) {
    console.error(
      "[OpenSearch] Error in ensureIndexExists:",
      error.meta ? JSON.stringify(error.meta.body) : error
    );
    throw error;
  }
}

async function generateContextForChunk(
  wholeDocumentContent,
  chunkContent,
  fileName
) {
  // Truncate document if too long to fit in context window
  const maxDocLength = 8000;
  const truncatedDoc =
    wholeDocumentContent.length > maxDocLength
      ? wholeDocumentContent.substring(0, maxDocLength) +
        "... [document truncated]"
      : wholeDocumentContent;

  const promptTemplate = `<document>
${truncatedDoc}
</document>

Here is a specific chunk from the document:
<chunk>
${chunkContent}
</chunk>

Please provide a brief context (2-3 sentences) that explains:
1. What section or topic this chunk belongs to in the document
2. How this chunk relates to the document's main theme
3. Any key entities or concepts that are referenced but not fully explained in the chunk

Keep the context concise and focused on improving search retrieval. Do not repeat the chunk content itself.`;

  try {
    const response = await llm.invoke(promptTemplate);
    return typeof response.content === "string"
      ? response.content.trim()
      : "Failed to generate valid context.";
  } catch (error) {
    console.error("[LLM Error] Failed to generate context for chunk:", error);
    return `This chunk is from "${fileName}" and discusses topics related to the document's content.`;
  }
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }
  const dotProduct = vecA.reduce((acc, val, i) => acc + val * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
  const magB = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
  if (magA === 0 || magB === 0) {
    return 0;
  }
  return dotProduct / (magA * magB);
}

async function semanticSplit(text, embeddingModel, threshold = 0.85) {
  // Split the document into individual sentences
  const sentences = text
    .split(/(?<=[.?!])\s+/)
    .filter((s) => s.trim().length > 0);

  if (sentences.length <= 1) {
    return [text];
  }

  // Get embeddings for each sentence
  console.log(
    `[Semantic Split] Generating embeddings for ${sentences.length} sentences...`
  );
  const embeddings = await embeddingModel.embedDocuments(sentences);
  console.log(`[Semantic Split] Embeddings generated.`);

  // Find split points based on similarity drop
  const chunks = [];
  let currentChunkSentences = [sentences[0]];

  for (let i = 1; i < sentences.length; i++) {
    const prevEmbedding = embeddings[i - 1];
    const currentEmbedding = embeddings[i];
    const similarity = cosineSimilarity(prevEmbedding, currentEmbedding);

    if (similarity < threshold) {
      chunks.push(currentChunkSentences.join(" ").trim());
      currentChunkSentences = [];
    }
    currentChunkSentences.push(sentences[i]);
  }

  // Add the last remaining chunk
  if (currentChunkSentences.length > 0) {
    chunks.push(currentChunkSentences.join(" ").trim());
  }

  console.log(
    `[Semantic Split] Document split into ${chunks.length} semantic chunks.`
  );
  return chunks;
}

/**************** Main Upload Route ****************/
app.post("/upload", upload.array("files"), async (req, res) => {
  const files = req.files;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files uploaded." });
  }

  try {
    await ensureIndexExists();
    let totalChunksEmbedded = 0;
    const processingStats = {
      filesProcessed: 0,
      chunksCreated: 0,
      contextsGenerated: 0,
      errors: [],
    };

    for (const file of files) {
      console.log(`[Processing] Starting processing for: ${file.originalname}`);

      try {
        // 1. Load Document Content
        let loader;
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === ".pdf") {
          loader = new PDFLoader(file.path);
        } else if (ext === ".docx") {
          loader = new DocxLoader(file.path);
        } else {
          loader = new TextLoader(file.path);
        }

        const docs = await loader.load();
        const wholeDocumentContent = docs
          .map((doc) => doc.pageContent)
          .join("\n");

        if (!wholeDocumentContent.trim()) {
          console.warn(
            `[Processing] No content extracted from ${file.originalname}. Skipping.`
          );
          processingStats.errors.push({
            file: file.originalname,
            error: "No content extracted",
          });
          continue;
        }

        // 2. Split Document into Semantic Chunks
        const semanticChunksText = await semanticSplit(
          wholeDocumentContent,
          embeddings
        );
        processingStats.chunksCreated += semanticChunksText.length;

        // 3. Generate context and create enriched chunks
        console.log(
          `[Context Generation] Processing ${semanticChunksText.length} chunks for ${file.originalname}...`
        );
        const enrichedChunks = [];

        for (let i = 0; i < semanticChunksText.length; i++) {
          const chunkText = semanticChunksText[i];

          // Add delay between LLM calls to avoid rate limits
          if (i > 0 && ENABLE_CONTEXT_GENERATION) {
            await sleep(parseInt(CONTEXT_GENERATION_DELAY_MS));
          }

          let enrichedContent;
          let chunkContext = "";

          if (ENABLE_CONTEXT_GENERATION) {
            // Generate contextual summary for this chunk
            chunkContext = await generateContextForChunk(
              wholeDocumentContent,
              chunkText,
              file.originalname
            );
            enrichedContent = `Context: ${chunkContext}\n\nContent: ${chunkText}`;
            processingStats.contextsGenerated++;
          } else {
            // Skip context generation for faster testing
            enrichedContent = chunkText;
          }

          enrichedChunks.push({
            pageContent: enrichedContent,
            metadata: {
              source: file.originalname,
              chunkIndex: i,
              totalChunks: semanticChunksText.length,
              originalChunkText: chunkText,
              generatedContext: chunkContext,
              documentLength: wholeDocumentContent.length,
              chunkLength: chunkText.length,
            },
          });

          // Log progress
          if ((i + 1) % 5 === 0 || i === semanticChunksText.length - 1) {
            console.log(
              `[Context Generation] Processed ${i + 1}/${
                semanticChunksText.length
              } chunks`
            );
          }
        }

        // 4. Embed and Store the enriched chunks
        console.log(
          `[Embedding] Embedding ${enrichedChunks.length} chunks into OpenSearch...`
        );
        await OpenSearchVectorStore.fromDocuments(enrichedChunks, embeddings, {
          client: openSearchClient,
          indexName: OPENSEARCH_INDEX_NAME,
        });

        totalChunksEmbedded += enrichedChunks.length;
        processingStats.filesProcessed++;
        console.log(
          `[Success] Successfully processed ${file.originalname} (${enrichedChunks.length} chunks)`
        );
      } catch (fileError) {
        console.error(
          `[Error] Failed to process ${file.originalname}:`,
          fileError
        );
        processingStats.errors.push({
          file: file.originalname,
          error: fileError.message,
        });
      } finally {
        // Clean up the temporary file
        await fs
          .unlink(file.path)
          .catch((err) =>
            console.error(
              `[Cleanup] Failed to delete temp file: ${err.message}`
            )
          );
      }
    }

    // Return detailed response
    const response = {
      success: true,
      message: `Processing complete. Successfully processed ${processingStats.filesProcessed}/${files.length} files.`,
      stats: {
        filesUploaded: files.length,
        filesProcessed: processingStats.filesProcessed,
        totalChunksCreated: processingStats.chunksCreated,
        totalChunksEmbedded: totalChunksEmbedded,
        contextsGenerated: processingStats.contextsGenerated,
        contextGenerationEnabled: ENABLE_CONTEXT_GENERATION,
        indexName: OPENSEARCH_INDEX_NAME,
      },
    };

    if (processingStats.errors.length > 0) {
      response.errors = processingStats.errors;
    }

    res.status(200).json(response);
  } catch (error) {
    console.error("[Upload] Critical endpoint error:", error);
    res.status(500).json({
      error: "An unexpected error occurred during file processing.",
      details: error.message,
    });
  }
});

/**************** Health Check Endpoint ****************/
app.get("/health", async (req, res) => {
  try {
    const osHealth = await openSearchClient.cluster.health();
    res.status(200).json({
      status: "healthy",
      service: "embedding-service",
      opensearch: osHealth.body.status,
      contextGeneration: ENABLE_CONTEXT_GENERATION,
      embeddingProvider: EMBEDDING_PROVIDER,
      llmProvider: LLM_PROVIDER,
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
    });
  }
});

/**************** Start Server ****************/
app.listen(PORT, async () => {
  console.log(`Embedding Service running on http://localhost:${PORT}`);
  console.log(
    `Context Generation: ${ENABLE_CONTEXT_GENERATION ? "ENABLED" : "DISABLED"}`
  );
  console.log(`LLM Provider: ${LLM_PROVIDER}`);
  console.log(`Embedding Provider: ${EMBEDDING_PROVIDER}`);

  try {
    await ensureIndexExists();
  } catch (error) {
    console.error(
      `[Startup] CRITICAL: Could not connect to or create OpenSearch index.`,
      error
    );
    process.exit(1);
  }
});
