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
const { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { OpenSearchVectorStore } = require("@langchain/community/vectorstores/opensearch");
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
    EMBED_DIM = 768
} = process.env;


/**************** Initialize Clients ****************/
const app = express();

// --- OpenSearch Client ---
const openSearchClient = new OSClient({
    node: `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`,
});

// --- Generative LLM for Contextualization ---
let llm;
console.log(`[Initialization] Initializing LLM for Context Generation via provider: ${LLM_PROVIDER}`);
if (LLM_PROVIDER === 'gemini') {
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
console.log(`[Initialization] Initializing Embedding Model via provider: ${EMBEDDING_PROVIDER}`);
if (EMBEDDING_PROVIDER === 'gemini') {
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
        const exists = await openSearchClient.indices.exists({ index: OPENSEARCH_INDEX_NAME });
        if (!exists.body) {
            console.log(`[OpenSearch] Index '${OPENSEARCH_INDEX_NAME}' not found. Creating with EMBED_DIM: ${EMBED_DIM}...`);
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
            console.log(`[OpenSearch] Index '${OPENSEARCH_INDEX_NAME}' created successfully.`);
        } else {
            console.log(`[OpenSearch] Index '${OPENSEARCH_INDEX_NAME}' already exists.`);
        }
    } catch (error) {
        console.error("[OpenSearch] Error in ensureIndexExists:", error.meta ? JSON.stringify(error.meta.body) : error);
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
        return typeof response.content === 'string' ? response.content.trim() : "Failed to generate valid context.";
    } catch (error) {
        console.error('[LLM Error] Failed to generate context for chunk:', error);
        return "No additional context could be generated due to an error.";
    }
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
            console.log(`[Processing] Starting contextual retrieval for: ${file.originalname}`);
            
            // 1. Load Document Content using appropriate LangChain loader
            let loader;
            const ext = path.extname(file.originalname).toLowerCase();
            if (ext === '.pdf') {
                loader = new PDFLoader(file.path);
            } else if (ext === '.docx') {
                loader = new DocxLoader(file.path);
            } else { // .txt, .md, .json etc.
                loader = new TextLoader(file.path);
            }
            const docs = await loader.load();
            const wholeDocumentContent = docs.map(doc => doc.pageContent).join("\n");

            if (!wholeDocumentContent.trim()) {
                console.warn(`[Processing] No content extracted from ${file.originalname}. Skipping.`);
                continue;
            }

            // 2. Split Document into Initial Chunks
            const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: CHUNK_SIZE, chunkOverlap: CHUNK_OVERLAP });
            const initialChunks = await textSplitter.createDocuments([wholeDocumentContent]);
            console.log(`[Chunking] Document split into ${initialChunks.length} chunks.`);

            // 3. Generate Context for Each Chunk in Parallel
            console.log(`[Context Gen] Starting context generation for ${initialChunks.length} chunks...`);
            const contextualChunkPromises = initialChunks.map(async (chunk, index) => {
                const generatedContext = await generateContextForChunk(wholeDocumentContent, chunk.pageContent);
                console.log(`[Context Gen] Generated context for chunk ${index + 1}`);
                
                // Prepend the generated context to the original chunk content
                const contextualizedContent = `Context: ${generatedContext}\n\n---\n\nContent: ${chunk.pageContent}`;
                
                return {
                    pageContent: contextualizedContent,
                    metadata: { ...chunk.metadata, source: file.originalname }
                };
            });

            const contextualChunks = await Promise.all(contextualChunkPromises);
            console.log(`[Context Gen] All contexts generated successfully for ${file.originalname}.`);

            // 4. Embed and Store the Contextualized Chunks
            console.log(`[Embedding] Embedding ${contextualChunks.length} contextual chunks into OpenSearch...`);
            await OpenSearchVectorStore.fromDocuments(contextualChunks, embeddings, {
                client: openSearchClient,
                indexName: OPENSEARCH_INDEX_NAME,
            });
            
            totalChunksEmbedded += contextualChunks.length;
            console.log(`[Success] Successfully processed and embedded ${file.originalname}`);

            // Clean up the temporary file
            await fs.unlink(file.path);
        }

        res.status(200).json({
            message: `Successfully processed ${files.length} files. Embedded and indexed ${totalChunksEmbedded} contextual document chunks into '${OPENSEARCH_INDEX_NAME}'.`
        });

    } catch (error) {
        console.error("[Upload] Critical endpoint error:", error);
        res.status(500).json({ error: "An unexpected error occurred during file processing.", details: error.message });
    }
});


/**************** Start Server ****************/
app.listen(PORT, async () => {
    console.log(`Embedding Service running on http://localhost:${PORT}`);
    console.log(`Attempting to ensure OpenSearch index '${OPENSEARCH_INDEX_NAME}' exists...`);
    try {
        await ensureIndexExists();
    } catch (error) {
        console.error(`[Startup] CRITICAL: Could not connect to or create OpenSearch index. Please check OpenSearch is running and accessible.`, error);
        process.exit(1);
    }
});