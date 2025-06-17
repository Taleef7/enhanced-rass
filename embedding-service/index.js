/**********************************************************************
 * embeddingService - Node.js Microservice for Text Embeddings
 *
 * Now with Contextual Retrieval Enhancement:
 * 1. Reads the full text of a document.
 * 2. Splits it into chunks.
 * 3. For each chunk, it calls a generative LLM to create a summary
 * based on the chunk's content within the context of the full document.
 * 4. Prepends this generated context to the original chunk.
 * 5. Embeds the final "contextualized chunk" into OpenSearch.
 *********************************************************************/

// Using require for consistency in this Node.js environment
const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const sanitize = require("sanitize-filename");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const fs = require("fs-extra");
const path = require("path");

// Document Loaders & Parsers
const { TextLoader } = require("langchain/document_loaders/fs/text");
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const { DocxLoader } = require("@langchain/community/document_loaders/fs/docx");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");

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

// Destructure and set defaults for all environment variables
const {
  LLM_PROVIDER = "gemini", // "openai" or "gemini"
  EMBEDDING_PROVIDER = "gemini", // "openai" or "gemini"
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
} = process.env;

/**************** Initialize Clients ****************/
const app = express();

// --- OpenSearch Client ---
const openSearchClient = new OSClient({
  node: `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`,
});

// --- Generative LLM for Contextualization ---
let llm;
console.log(
  `[Initialization] Initializing LLM for Context Generation via provider: ${LLM_PROVIDER}`
);
if (LLM_PROVIDER === "gemini") {
  llm = new ChatGoogleGenerativeAI({
    apiKey: GEMINI_API_KEY,
    model: "gemini-2.0-flash-lite", // Good, cost-effective model for summarization
  });
} else {
  llm = new ChatOpenAI({
    apiKey: OPENAI_API_KEY,
    model: "gpt-4o-mini",
  });
}

// --- Embedding Model ---
let embeddings;
console.log(
  `[Initialization] Initializing Embedding Model via provider: ${EMBEDDING_PROVIDER}`
);
if (EMBEDDING_PROVIDER === "gemini") {
  embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: GEMINI_API_KEY,
    modelName: "text-embedding-004", // Latest Google embedding model
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

/**
 * Ensures the target OpenSearch index exists, creating it with the correct
 * vector mapping if it doesn't.
 */
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
          settings: { index: { knn: true, "knn.algo_param.ef_search": 100 } },
          mappings: {
            properties: {
              embedding: { type: "knn_vector", dimension: EMBED_DIM },
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

/**
 * Uses the configured LLM to generate a concise summary for a text chunk,
 * based on its content within the larger document.
 * @param {string} wholeDocumentContent - The full text of the source document.
 * @param {string} chunkContent - The specific text content of the chunk.
 * @returns {Promise<string>} A promise that resolves to the generated context.
 */
async function generateContextForChunk(wholeDocumentContent, chunkContent) {
  const promptTemplate = `
<document>
${wholeDocumentContent}
</document>
Here is the chunk we want to situate within the whole document:
<chunk>
${chunkContent}
</chunk>
Please give a short, succinct context to situate this chunk within the
overall document for the purposes of improving search retrieval of the
chunk. Answer only with the succinct context and nothing else.`;

  try {
    const response = await llm.invoke(promptTemplate);
    // Ensure response.content is a string, handle potential object responses
    return typeof response.content === "string"
      ? response.content.trim()
      : "Failed to generate valid context.";
  } catch (error) {
    console.error("[LLM Error] Failed to generate context for chunk:", error);
    return "No additional context could be generated due to an error.";
  }
}

/**
 * Calculates the cosine similarity between two vectors.
 * @param {number[]} vecA - The first vector.
 * @param {number[]} vecB - The second vector.
 * @returns {number} The cosine similarity score.
 */
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

/**
 * Splits a document into chunks based on semantic similarity.
 * @param {string} text - The full text of the document.
 * @param {object} embeddingModel - The initialized embedding model.
 * @param {number} threshold - The similarity score threshold to split on.
 * @returns {Promise<string[]>} A promise that resolves to an array of text chunks.
 */
async function semanticSplit(text, embeddingModel, threshold = 0.85) {
  // 1. Split the document into individual sentences
  const sentences = text
    .split(/(?<=[.?!])\s+/)
    .filter((s) => s.trim().length > 0);
  if (sentences.length <= 1) {
    return [text];
  }

  // 2. Get embeddings for each sentence
  console.log(
    `[Semantic Split] Generating embeddings for ${sentences.length} sentences...`
  );
  const embeddings = await embeddingModel.embedDocuments(sentences);
  console.log(`[Semantic Split] Embeddings generated.`);

  // 3. Find split points based on similarity drop
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

    for (const file of files) {
      console.log(
        `[Processing] Starting semantic chunking for: ${file.originalname}`
      );

      // 1. Load Document Content using appropriate LangChain loader
      let loader;
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === ".pdf") {
        loader = new PDFLoader(file.path);
      } else if (ext === ".docx") {
        loader = new DocxLoader(file.path);
      } else {
        // .txt, .md, .json etc.
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
        continue;
      }

      // 2. Split Document into Chunks using our new Semantic Splitter
      const semanticChunksText = await semanticSplit(
        wholeDocumentContent,
        embeddings
      );

      // Convert the text chunks back into LangChain Document objects for the vector store
      const finalChunks = semanticChunksText.map((chunkText) => ({
        pageContent: chunkText,
        metadata: { source: file.originalname },
      }));

      // 3. Embed and Store the final chunks
      console.log(
        `[Embedding] Embedding ${finalChunks.length} semantic chunks into OpenSearch...`
      );
      await OpenSearchVectorStore.fromDocuments(finalChunks, embeddings, {
        client: openSearchClient,
        indexName: OPENSEARCH_INDEX_NAME,
      });

      totalChunksEmbedded += finalChunks.length;
      console.log(
        `[Success] Successfully processed and embedded ${file.originalname}`
      );

      // Clean up the temporary file
      await fs.unlink(file.path);
    }

    res.status(200).json({
      message: `Successfully processed ${files.length} files. Embedded and indexed ${totalChunksEmbedded} semantic document chunks into '${OPENSEARCH_INDEX_NAME}'.`,
    });
  } catch (error) {
    console.error("[Upload] Critical endpoint error:", error);
    res.status(500).json({
      error: "An unexpected error occurred during file processing.",
      details: error.message,
    });
  }
});

/**************** Start Server ****************/
app.listen(PORT, async () => {
  console.log(`Embedding Service running on http://localhost:${PORT}`);
  console.log(
    `Attempting to ensure OpenSearch index '${OPENSEARCH_INDEX_NAME}' exists...`
  );
  try {
    await ensureIndexExists();
  } catch (error) {
    console.error(
      `[Startup] CRITICAL: Could not connect to or create OpenSearch index. Please check OpenSearch is running and accessible.`,
      error
    );
    process.exit(1);
  }
});
