/**********************************************************************
 * embeddingService - Node.js Microservice for Text Embeddings
 * Supports OpenAI and Gemini (Vertex AI) providers.
 *********************************************************************/
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const fsPromises = require("fs").promises;
const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const sanitize = require("sanitize-filename");
const cookieParser = require("cookie-parser");

// Provider SDKs
const { OpenAI } = require("openai");
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai"); // Added HarmBlockThreshold etc for safety settings

const { Client: OSClient } = require("@opensearch-project/opensearch");
const fs = require("fs-extra");
const path = require("path");
const MarkdownIt = require("markdown-it");
const cheerio = require("cheerio");
const dotenv = require("dotenv");

/**************** Load ENV ****************/
dotenv.config();

const {
    // OpenAI specific
    OPENAI_API_KEY,
    OPENAI_EMBED_MODEL_NAME = "text-embedding-3-small",

    // Gemini (Vertex AI) specific
    GEMINI_API_KEY,
    GEMINI_EMBED_MODEL_NAME: RAW_GEMINI_EMBED_MODEL_NAME = "gemini-embedding-001", // Raw name from .env

    // Provider choice
    EMBEDDING_PROVIDER = "openai", // "openai" or "gemini"

    // Common embedding & chunking params
    OPENSEARCH_HOST = "localhost",
    OPENSEARCH_PORT = "9200",
    OPENSEARCH_INDEX_NAME = "knowledge_base", // Default if not specified in .env
    TEMP_DIR = "./temp",
    UPLOAD_DIR = "./uploads",
} = process.env;

// Trim whitespace from model names that might come from .env
const GEMINI_EMBED_MODEL_NAME = RAW_GEMINI_EMBED_MODEL_NAME.trim();

// Parse numeric and specific string values from .env
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE, 10) || 1000;
const EMBED_DIM = parseInt(process.env.EMBED_DIM, 10) || (EMBEDDING_PROVIDER === "gemini" && GEMINI_EMBED_MODEL_NAME === "gemini-embedding-001" ? 3072 : 1536); // Dynamic default based on provider/model if not set
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE, 10) || 10485760;
const MAX_FILES_PER_REQUEST = parseInt(process.env.MAX_FILES_PER_REQUEST, 10) || 5;
const EMBEDDING_BATCH_SIZE = parseInt(process.env.EMBEDDING_BATCH_SIZE, 10) || 16; // For OpenAI batching and Gemini loop logging/control
const PORT = process.env.PORT || 8001;

// Ensure directories exist
fs.ensureDirSync(UPLOAD_DIR);
fs.ensureDirSync(TEMP_DIR);

const app = express();
const md = new MarkdownIt();

/**************** Initialize Clients ****************/
let openaiClient;
let googleGenAI;
let geminiEmbedder; // This will be the GenerativeModel instance for embeddings

console.log(`[Initialization] Selected EMBEDDING_PROVIDER: ${EMBEDDING_PROVIDER}`);
console.log(`[Initialization] Target OpenSearch Index: ${OPENSEARCH_INDEX_NAME}`);
console.log(`[Initialization] Embedding Dimension (EMBED_DIM): ${EMBED_DIM}`);

if (EMBEDDING_PROVIDER === "openai") {
    if (!OPENAI_API_KEY) {
        console.error("[Initialization] OpenAI API key is required when EMBEDDING_PROVIDER is 'openai'.");
        process.exit(1);
    }
    openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
    console.log(`[Initialization] OpenAI client initialized with model: ${OPENAI_EMBED_MODEL_NAME}`);
    if (OPENAI_EMBED_MODEL_NAME === "text-embedding-3-small" && EMBED_DIM !== 1536) {
        console.warn(`[Initialization] WARNING: OpenAI model ${OPENAI_EMBED_MODEL_NAME} outputs 1536 dimensions, but EMBED_DIM is ${EMBED_DIM}. Check .env & OpenSearch index mapping.`);
    } else if (OPENAI_EMBED_MODEL_NAME === "text-embedding-3-large" && EMBED_DIM !== 3072) {
        console.warn(`[Initialization] WARNING: OpenAI model ${OPENAI_EMBED_MODEL_NAME} outputs 3072 dimensions, but EMBED_DIM is ${EMBED_DIM}. Check .env & OpenSearch index mapping.`);
    }
} else if (EMBEDDING_PROVIDER === "gemini") {
    if (!GEMINI_API_KEY) {
        console.error("[Initialization] Gemini API key is required when EMBEDDING_PROVIDER is 'gemini'.");
        process.exit(1);
    }
    googleGenAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    geminiEmbedder = googleGenAI.getGenerativeModel({ model: GEMINI_EMBED_MODEL_NAME }); // Model name includes "models/" prefix if using older SDK/direct REST. SDK handles it.
    console.log(`[Initialization] Gemini client initialized with model: ${GEMINI_EMBED_MODEL_NAME}`);

    // Validate EMBED_DIM for known Gemini models
    if (GEMINI_EMBED_MODEL_NAME === "gemini-embedding-001" && EMBED_DIM !== 3072) { // Default is 3072 for gemini-embedding-001
        console.warn(`[Initialization] WARNING: Gemini model ${GEMINI_EMBED_MODEL_NAME} typically outputs 3072 dimensions (or as configured by outputDimensionality), but EMBED_DIM is ${EMBED_DIM}. This may cause issues if not intended. Ensure OpenSearch index is mapped correctly.`);
    } else if (GEMINI_EMBED_MODEL_NAME === "text-embedding-004" && EMBED_DIM !== 768) { // Legacy or specific model
        console.warn(`[Initialization] WARNING: Gemini model ${GEMINI_EMBED_MODEL_NAME} outputs 768 dimensions, but EMBED_DIM is ${EMBED_DIM}. Check .env & OpenSearch index mapping.`);
    }
} else {
    console.error(`[Initialization] Invalid EMBEDDING_PROVIDER: '${EMBEDDING_PROVIDER}'. Supported: 'openai', 'gemini'.`);
    process.exit(1);
}

const osClient = new OSClient({
    node: `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`,
});

/**************** Middleware ***************/
app.use(express.json());
app.use(cookieParser());

const upload = multer({
    dest: TEMP_DIR,
    limits: { fileSize: MAX_FILE_SIZE },
});

/************ Helper: Ensure OpenSearch Index ***********/
async function ensureIndexExists() {
    try {
        const exists = await osClient.indices.exists({ index: OPENSEARCH_INDEX_NAME });
        if (!exists.body) {
            console.log(`[OpenSearch] Index '${OPENSEARCH_INDEX_NAME}' not found. Creating with EMBED_DIM: ${EMBED_DIM}...`);
            await osClient.indices.create({
                index: OPENSEARCH_INDEX_NAME,
                body: {
                    settings: { index: { knn: true, "knn.algo_param.ef_search": 400, number_of_shards: 1, number_of_replicas: 0 } },
                    mappings: {
                        properties: {
                            doc_id: { type: "keyword" },
                            file_type: { type: "keyword" },
                            file_path: { type: "keyword" },
                            text_chunk: { type: "text" },
                            embedding: {
                                type: "knn_vector",
                                dimension: EMBED_DIM, // Critical: Uses EMBED_DIM from .env
                                method: { name: "hnsw", engine: "nmslib", space_type: "cosinesimil", parameters: { m: 48, ef_construction: 400 } },
                            },
                        },
                    },
                },
            });
            console.log(`[OpenSearch] Created index '${OPENSEARCH_INDEX_NAME}' with dimension ${EMBED_DIM}.`);
        } else {
            console.log(`[OpenSearch] Index '${OPENSEARCH_INDEX_NAME}' already exists.`);
            // Optional: Add a check here to verify if existing index dimension matches current EMBED_DIM
            // This is more complex as it involves getting existing mapping and parsing it.
        }
    } catch (error) {
        console.error("[OpenSearch] Error in ensureIndexExists:", error.meta ? JSON.stringify(error.meta.body) : error);
        throw error;
    }
}

/************ Helper: Text Chunking ***********/
function chunkText(text, currentChunkSize = CHUNK_SIZE) {
    const chunks = [];
    if (typeof text !== "string") {
        console.warn("[Chunking] Input text is not a string. Returning empty chunks.");
        return chunks;
    }
    for (let i = 0; i < text.length; i += currentChunkSize) {
        chunks.push(text.slice(i, i + currentChunkSize));
    }
    return chunks;
}

/************ Helper: Read file text (No changes needed from your version) ***********/
async function readFileText(filePath, fileType) {
    let textContent = "";
    try {
        if (fileType === "md") {
            const rawContent = await fsPromises.readFile(filePath, "utf8");
            const html = md.render(rawContent);
            const $ = cheerio.load(html);
            textContent = $("body").text();
        } else if (fileType === "pdf") {
            const dataBuffer = await fsPromises.readFile(filePath);
            if (dataBuffer.length === 0) { console.warn(`[FileRead] PDF file is empty: ${filePath}`); return ""; }
            const data = await pdf(dataBuffer);
            textContent = data.text;
        } else if (fileType === "docx") {
            const result = await mammoth.extractRawText({ path: filePath });
            textContent = result.value;
            if (result.messages && result.messages.length > 0) {
                console.warn(`[FileRead] Mammoth messages for ${filePath}:`);
                result.messages.forEach((message) => console.warn(`  - ${message.type}: ${message.message}`));
            }
        } else if (fileType === "txt" || fileType === "json") {
            textContent = await fsPromises.readFile(filePath, "utf8");
        } else {
            console.warn(`[FileRead] Unsupported file type: ${fileType} for file: ${filePath}`); return "";
        }
    } catch (error) {
        console.error(`[FileRead] Error reading file ${filePath} (type: ${fileType}):`, error); return "";
    }
    return textContent;
}


/************ Embedding Helper: OpenAI ***********/
async function getOpenAIEmbeddings(textsToEmbed, modelNameForAPI, batchSizeForAPI) {
    if (!openaiClient) throw new Error("[OpenAIEmbed] OpenAI client not initialized.");
    if (!textsToEmbed || textsToEmbed.length === 0) return [];
    const allEmbeddings = [];
    for (let i = 0; i < textsToEmbed.length; i += batchSizeForAPI) {
        const batchTexts = textsToEmbed.slice(i, i + batchSizeForAPI);
        try {
            console.log(`[OpenAIEmbed] Requesting for ${batchTexts.length} texts (model: ${modelNameForAPI}). Batch ${Math.floor(i / batchSizeForAPI) + 1} of ${Math.ceil(textsToEmbed.length / batchSizeForAPI)}`);
            const response = await openaiClient.embeddings.create({ model: modelNameForAPI, input: batchTexts });
            allEmbeddings.push(...response.data.map(item => item.embedding));
            console.log(`[OpenAIEmbed] Received ${response.data.length} embeddings from batch.`);
        } catch (error) {
            const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
            console.error(`[OpenAIEmbed] Error for batch (model: ${modelNameForAPI}):`, errMsg);
            if (error.response?.data?.error) console.error(`[OpenAIEmbed] API Error Details: ${JSON.stringify(error.response.data.error)}`);
            throw new Error(`Failed to get OpenAI embeddings: ${errMsg}`);
        }
    }
    return allEmbeddings;
}

/************ Embedding Helper: Gemini ***********/
async function getGeminiEmbeddings(textsToEmbed) { // modelName is implicit via geminiEmbedder
    if (!geminiEmbedder) throw new Error("[GeminiEmbed] Gemini client/embedder not initialized.");
    if (!textsToEmbed || textsToEmbed.length === 0) return [];

    const allEmbeddings = [];
    console.log(`[GeminiEmbed] Preparing to embed ${textsToEmbed.length} texts one by one (model: ${GEMINI_EMBED_MODEL_NAME}, output dim: ${EMBED_DIM}).`);

    // Gemini gemini-embedding-001 has a "1 instance per request" limit for embeddings.
    // We will iterate and call embedContent for each text.
    // The EMBEDDING_BATCH_SIZE from .env can be used here for logging progress or introducing delays if necessary,
    // but not for actual batching in the API call to the model itself.
    let count = 0;
    for (const text of textsToEmbed) {
        count++;
        if (text == null || text.trim() === "") {
            console.warn(`[GeminiEmbed] Skipping empty text at index ${count -1}.`);
            // To maintain array correspondence, you might push a placeholder or handle this upstream.
            // For now, we'll skip and the final allEmbeddings array might be shorter than original textsToEmbed
            // if there were empty strings. This needs careful handling when matching with original chunks.
            // It's better to ensure validChunks are passed to this function.
            continue;
        }
        try {
            // Task type is important for Gemini embeddings for optimal performance.
            // For generating embeddings for documents to be stored and later retrieved.
            const taskType = "RETRIEVAL_DOCUMENT";
            
            // outputDimensionality is optional for gemini-embedding-001. If EMBED_DIM is set to 3072, it's default.
            // If EMBED_DIM is set lower (e.g., 256, 512, 768, 1024), specify it.
            const embedConfig = { taskType };
            if (EMBED_DIM < 3072 && GEMINI_EMBED_MODEL_NAME === "gemini-embedding-001") { // Only for gemini-embedding-001 if reducing dim
                 embedConfig.outputDimensionality = EMBED_DIM;
            }

            // console.log(`[GeminiEmbed] Requesting for text #${count} (length: ${text.length}). Config: ${JSON.stringify(embedConfig)}`); // Verbose log
            const result = await geminiEmbedder.embedContent({
                content: { parts: [{ text }] },
                ...embedConfig // Spread the config object here
            });

            allEmbeddings.push(result.embedding.values);

            if (count % EMBEDDING_BATCH_SIZE === 0 || count === textsToEmbed.length) {
                 console.log(`[GeminiEmbed] Processed ${count}/${textsToEmbed.length} texts.`);
            }

        } catch (error) {
            const errorMessage = error.message || JSON.stringify(error);
            console.error(`[GeminiEmbed] Error for text #${count} (model: ${GEMINI_EMBED_MODEL_NAME}):`, errorMessage);
            console.error(`[GeminiEmbed] Problematic text (first 50 chars): "${text.substring(0,50)}"`);
            if (error.stack) console.error(error.stack);
            // Decide if one failure should stop all: for now, let's rethrow.
            throw new Error(`Failed to get Gemini embedding for text #${count}: ${errorMessage}`);
        }
    }
    return allEmbeddings;
}


/************ Embedding Helper: Dispatcher ***********/
async function getEmbeddingsForPipeline(validChunksToEmbed) {
    if (!validChunksToEmbed || validChunksToEmbed.length === 0) {
        console.warn("[EmbedPipeline] No valid chunks provided for embedding.");
        return [];
    }
    console.log(`[EmbedPipeline] Provider: ${EMBEDDING_PROVIDER}. Preparing to embed ${validChunksToEmbed.length} valid chunks.`);

    if (EMBEDDING_PROVIDER === 'openai') {
        return getOpenAIEmbeddings(validChunksToEmbed, OPENAI_EMBED_MODEL_NAME, EMBEDDING_BATCH_SIZE);
    } else if (EMBEDDING_PROVIDER === 'gemini') {
        return getGeminiEmbeddings(validChunksToEmbed); // EMBEDDING_BATCH_SIZE is used internally by getGeminiEmbeddings for logging
    } else {
        console.error(`[EmbedPipeline] Unsupported EMBEDDING_PROVIDER: '${EMBEDDING_PROVIDER}'`);
        throw new Error(`Unsupported EMBEDDING_PROVIDER: ${EMBEDDING_PROVIDER}`);
    }
}

/************ POST /upload (Main Changes in how embeddings are called) ***********/
app.post(
    "/upload",
    upload.array("files", MAX_FILES_PER_REQUEST),
    async (req, res) => {
        try {
            const files = req.files;
            if (!files?.length) return res.status(400).json({ error: "No files uploaded" });

            await ensureIndexExists();

            const docsForBulkInsert = [];
            let successfullyProcessedFiles = 0;
            let totalEmbeddedChunks = 0;

            for (const file of files) {
                const originalFileName = file.originalname || "unknown_file";
                const ext = path.extname(originalFileName).toLowerCase();

                if (![".txt", ".md", ".json", ".pdf", ".docx"].includes(ext)) {
                    console.warn(`[Upload] Unsupported file type '${ext}' skipped: ${originalFileName}`);
                    try { await fs.unlink(file.path); } catch (e) { console.error("[Upload] Error unlinking skipped temp file:", e); }
                    continue;
                }

                const sanitizedName = sanitize(path.basename(originalFileName));
                const finalName = `${uuidv4()}_${sanitizedName}`;
                const finalPath = path.join(UPLOAD_DIR, finalName);

                try { await fs.move(file.path, finalPath); }
                catch (moveError) {
                    console.error(`[Upload] Error moving file ${originalFileName} to ${finalPath}:`, moveError);
                    try { await fs.unlink(file.path); } catch (e) { console.error("[Upload] Error unlinking temp file after failed move:", e); }
                    continue;
                }

                const textContent = await readFileText(finalPath, ext.substring(1));
                if (!textContent || textContent.trim().length === 0) {
                    console.warn(`[Upload] No text extracted from ${finalPath}. Skipping.`);
                    continue;
                }

                const chunks = chunkText(textContent, CHUNK_SIZE);
                const validChunks = chunks.filter(chunk => chunk && chunk.trim().length > 0);

                if (validChunks.length === 0) {
                    console.warn(`[Upload] No valid (non-empty) chunks for ${finalPath}. Skipping.`);
                    continue;
                }
                if (validChunks.length < chunks.length) {
                     console.warn(`[Upload] ${chunks.length - chunks.length} empty/invalid chunks for ${finalPath} were filtered out before embedding.`);
                }

                let fileEmbeddings;
                try {
                    console.log(`[Upload] Getting embeddings for ${validChunks.length} valid chunks from file ${originalFileName}`);
                    fileEmbeddings = await getEmbeddingsForPipeline(validChunks);
                } catch (embeddingError) {
                    console.error(`[Upload] Embedding failed for ${originalFileName}. Error: ${embeddingError.message}. Skipping file.`);
                    continue;
                }

                if (!fileEmbeddings || fileEmbeddings.length !== validChunks.length) {
                    // This check is important because getGeminiEmbeddings might skip empty strings AFTER filtering,
                    // though we try to filter validChunks before. This ensures arrays align.
                    console.warn(`[Upload] Embedding count mismatch for ${originalFileName}. Expected ${validChunks.length}, got ${fileEmbeddings ? fileEmbeddings.length : 0}. Skipping file.`);
                    continue;
                }

                successfullyProcessedFiles++;
                for (let i = 0; i < validChunks.length; i++) {
                    const chunkToStore = validChunks[i];
                    const embedding = fileEmbeddings[i];
                    const docId = `${path.basename(finalName)}-chunk${i}`;
                    docsForBulkInsert.push({ index: { _index: OPENSEARCH_INDEX_NAME, _id: docId } });
                    docsForBulkInsert.push({ doc_id: docId, file_type: ext.substring(1), file_path: finalPath, text_chunk: chunkToStore, embedding });
                    totalEmbeddedChunks++;
                }
            }

            if (docsForBulkInsert.length > 0) {
                console.log(`[Upload] Attempting bulk insert of ${docsForBulkInsert.length / 2} document chunks into index '${OPENSEARCH_INDEX_NAME}'.`);
                const bulkResp = await osClient.bulk({ refresh: true, body: docsForBulkInsert });
                if (bulkResp.body.errors) {
                    console.error("[Upload] Bulk insert had errors. Logging first error item:");
                    const firstError = bulkResp.body.items.find(item => item.index && item.index.error);
                    console.error(JSON.stringify(firstError, null, 2));
                    return res.status(500).json({ error: "Bulk insert failed.", details: "Check service logs." });
                }
                res.json({ message: `Successfully processed ${successfullyProcessedFiles} files. Embedded and indexed ${totalEmbeddedChunks} document chunks into '${OPENSEARCH_INDEX_NAME}'.` });
            } else if (successfullyProcessedFiles > 0) {
                res.status(200).json({ message: `Processed ${successfullyProcessedFiles} files, but no valid content could be embedded/indexed. Check logs.` });
            } else {
                res.status(400).json({ error: "No files processed or no valid content found." });
            }
        } catch (err) {
            console.error("[Upload] Critical endpoint error:", err);
            res.status(500).json({ error: err.message || "An unexpected error occurred." });
        }
    }
);

/************ Start Server ***********/
app.listen(PORT, async () => { // Make listen callback async to await ensureIndexExists
    console.log(`Embedding Service running on http://localhost:${PORT}`);
    console.log(`Attempting to ensure OpenSearch index '${OPENSEARCH_INDEX_NAME}' exists...`);
    try {
        // It's good practice to ensure the index exists (or is created) on service startup
        // if the service relies on it. This makes it ready before the first /upload.
        await ensureIndexExists();
    } catch (error) {
        console.error(`[Startup] Failed to ensure OpenSearch index '${OPENSEARCH_INDEX_NAME}' exists. Service may not function correctly with OpenSearch. Error: ${error.message}`);
        // Decide if you want to exit if OpenSearch is critical and not available/creatable
        // process.exit(1);
    }
});


/************ Global Error Handlers (No changes) ***********/
process.on("unhandledRejection", (reason, promise) => {
    console.error("[UnhandledRejection] Reason:", reason, "Promise:", promise);
    process.exit(1);
});
process.on("uncaughtException", (err, origin) => {
    console.error(`[UncaughtException] Error: ${err.message}\nOrigin: ${origin}\nStack: ${err.stack}`);
    process.exit(1);
});