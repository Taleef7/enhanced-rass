/**********************************************************************
 * embeddingService - Node.js OpenAI-based Embedding Microservice
 *********************************************************************/
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const fsPromises = require("fs").promises;
const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const sanitize = require("sanitize-filename");
const cookieParser = require("cookie-parser");
const { OpenAI } = require("openai"); // Official OpenAI v4 library

const { Client: OSClient } = require("@opensearch-project/opensearch");
const fs = require("fs-extra");
const path = require("path");
const MarkdownIt = require("markdown-it");
const cheerio = require("cheerio");
const dotenv = require("dotenv");

/**************** Load ENV ****************/
dotenv.config();

// Destructure and parse environment variables
const {
    OPENAI_API_KEY,
    // OPENAI_API_URL, // Not typically needed for standard OpenAI library usage with v4+
    EMBEDDING_PROVIDER = "openai",
    OPENAI_EMBED_MODEL_NAME = "text-embedding-3-small",
    // GEMINI_API_KEY, // For future Gemini integration
    // GEMINI_EMBED_MODEL_NAME, // For future Gemini integration
    OPENSEARCH_HOST = "localhost",
    OPENSEARCH_PORT = "9200",
    OPENSEARCH_INDEX_NAME = "redmine_index", // Ensure this matches your .env
    TEMP_DIR = "./temp", // Default TEMP_DIR if not in .env
    UPLOAD_DIR = "./uploads", // Default UPLOAD_DIR if not in .env
} = process.env;

// Parse numeric and specific string values from .env
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE, 10) || 1000; // Default to 1000 if not set
const EMBED_DIM = parseInt(process.env.EMBED_DIM, 10) || 1536;
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE, 10) || 10485760;
const MAX_FILES_PER_REQUEST = parseInt(process.env.MAX_FILES_PER_REQUEST, 10) || 5;
const EMBEDDING_BATCH_SIZE = parseInt(process.env.EMBEDDING_BATCH_SIZE, 10) || 16;
const PORT = process.env.PORT || 8001;

// Ensure directories exist
fs.ensureDirSync(UPLOAD_DIR);
fs.ensureDirSync(TEMP_DIR); // Multer uses this

const app = express();
const md = new MarkdownIt();

/**************** Initialize Clients ****************/
let openaiClient;
if (EMBEDDING_PROVIDER === "openai") {
    if (!OPENAI_API_KEY) {
        console.error(
            "[Initialization] OpenAI API key is required when EMBEDDING_PROVIDER is 'openai'."
        );
        process.exit(1);
    }
    openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
    console.log(`[Initialization] OpenAI client initialized with model: ${OPENAI_EMBED_MODEL_NAME}`);
} else {
    console.warn(
        `[Initialization] EMBEDDING_PROVIDER is set to '${EMBEDDING_PROVIDER}', but only 'openai' is fully supported in this version. No embedding client initialized for this provider yet.`
    );
    // If you add other providers, initialize their clients here.
}

const osClient = new OSClient({
    node: `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`,
});

/**************** Middleware ***************/
app.use(express.json());
app.use(cookieParser());

const upload = multer({
    dest: TEMP_DIR, // Use the TEMP_DIR from .env
    limits: { fileSize: MAX_FILE_SIZE },
});

/************ Helper: Ensure OpenSearch Index ***********/
async function ensureIndexExists() {
    try {
        const exists = await osClient.indices.exists({
            index: OPENSEARCH_INDEX_NAME,
        });
        if (!exists.body) {
            await osClient.indices.create({
                index: OPENSEARCH_INDEX_NAME,
                body: {
                    settings: {
                        index: {
                            knn: true,
                            "knn.algo_param.ef_search": 400,
                            number_of_shards: 1,
                            number_of_replicas: 0,
                        },
                    },
                    mappings: {
                        properties: {
                            doc_id: { type: "keyword" },
                            file_type: { type: "keyword" },
                            file_path: { type: "keyword" },
                            text_chunk: { type: "text" },
                            embedding: {
                                type: "knn_vector",
                                dimension: EMBED_DIM, // Use EMBED_DIM from .env
                                method: {
                                    name: "hnsw",
                                    engine: "nmslib",
                                    space_type: "cosinesimil",
                                    parameters: { m: 48, ef_construction: 400 },
                                },
                            },
                        },
                    },
                },
            });
            console.log(`[OpenSearch] Created index '${OPENSEARCH_INDEX_NAME}'`);
        }
    } catch (error) {
        console.error("[OpenSearch] Error in ensureIndexExists:", error);
        throw error; // Re-throw to indicate failure at startup or first use
    }
}

/************ Helper: Text Chunking ***********/
function chunkText(text, currentChunkSize = CHUNK_SIZE) { // Accept chunkSize argument
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

/************ Helper: Read file text ***********/
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
            if (dataBuffer.length === 0) {
                console.warn(`[FileRead] PDF file is empty: ${filePath}`);
                return "";
            }
            const data = await pdf(dataBuffer);
            textContent = data.text;
        } else if (fileType === "docx") {
            const result = await mammoth.extractRawText({ path: filePath });
            textContent = result.value;
            if (result.messages && result.messages.length > 0) {
                console.warn(`[FileRead] Mammoth messages for ${filePath}:`);
                result.messages.forEach((message) =>
                    console.warn(`  - ${message.type}: ${message.message}`)
                );
            }
        } else if (fileType === "txt" || fileType === "json") {
            textContent = await fsPromises.readFile(filePath, "utf8");
        } else {
            console.warn(`[FileRead] Unsupported file type: ${fileType} for file: ${filePath}`);
            return "";
        }
    } catch (error) {
        console.error(`[FileRead] Error reading file ${filePath} (type: ${fileType}):`, error);
        return "";
    }
    return textContent;
}

/************ NEW Helper: Get OpenAI Embeddings (Batch Capable) ***********/
async function getOpenAIEmbeddings(textsToEmbed, modelName, batchSize) {
    if (!openaiClient) {
        console.error("[OpenAIEmbed] OpenAI client is not initialized.");
        throw new Error("OpenAI client is not initialized for embedding.");
    }
    if (!textsToEmbed || textsToEmbed.length === 0) {
        console.warn("[OpenAIEmbed] No texts provided to embed.");
        return [];
    }

    const allEmbeddings = [];
    for (let i = 0; i < textsToEmbed.length; i += batchSize) {
        const batchTexts = textsToEmbed.slice(i, i + batchSize);
        // The OpenAI API itself will error on empty strings in the input array.
        // Ensure no text in batchTexts is an empty string if the API version is sensitive.
        // However, we filter empty chunks before calling this function.

        try {
            console.log(`[OpenAIEmbed] Requesting for ${batchTexts.length} texts (model: ${modelName}). Batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(textsToEmbed.length / batchSize)}`);
            const response = await openaiClient.embeddings.create({
                model: modelName,
                input: batchTexts,
            });

            const embeddingsFromAPI = response.data.map(item => item.embedding);
            allEmbeddings.push(...embeddingsFromAPI);
            console.log(`[OpenAIEmbed] Received ${embeddingsFromAPI.length} embeddings from batch.`);

        } catch (error) {
            const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
            console.error(`[OpenAIEmbed] Error for batch (model: ${modelName}):`, errorMessage);
            // Log problematic texts for easier debugging if API returns specific error
            if (error.response && error.response.data && error.response.data.error) {
                 console.error(`[OpenAIEmbed] API Error Details: ${JSON.stringify(error.response.data.error)}`);
                 console.error(`[OpenAIEmbed] First text in failing batch (first 50 chars): "${batchTexts[0] ? batchTexts[0].substring(0,50) : 'N/A'}"`);
            }
            throw new Error(`Failed to get OpenAI embeddings for a batch: ${errorMessage}`);
        }
    }
    return allEmbeddings;
}

/************ NEW Helper: Get Embeddings (Dispatcher) ***********/
async function getEmbeddingsForPipeline(chunksToEmbed) {
    if (!chunksToEmbed || chunksToEmbed.length === 0) {
        console.warn("[EmbedPipeline] No chunks provided for embedding.");
        return [];
    }
    // Already filtered empty chunks in /upload before calling this

    if (EMBEDDING_PROVIDER === 'openai') {
        return getOpenAIEmbeddings(chunksToEmbed, OPENAI_EMBED_MODEL_NAME, EMBEDDING_BATCH_SIZE);
    } else if (EMBEDDING_PROVIDER === 'gemini') {
        // Placeholder for Gemini or other providers
        console.warn(`[EmbedPipeline] Provider '${EMBEDDING_PROVIDER}' not yet fully implemented for embeddings.`);
        // Example: return getGeminiEmbeddings(chunksToEmbed, GEMINI_EMBED_MODEL_NAME, EMBEDDING_BATCH_SIZE);
        throw new Error(`Provider '${EMBEDDING_PROVIDER}' not yet implemented for embeddings.`);
    } else {
        console.error(`[EmbedPipeline] Unsupported embedding provider: ${EMBEDDING_PROVIDER}`);
        throw new Error(`Unsupported embedding provider: ${EMBEDDING_PROVIDER}`);
    }
}


/************ POST /upload ***********/
app.post(
    "/upload",
    upload.array("files", MAX_FILES_PER_REQUEST), // Use MAX_FILES_PER_REQUEST from .env
    async (req, res) => {
        try {
            const files = req.files;
            if (!files?.length) {
                return res.status(400).json({ error: "No files uploaded" });
            }

            await ensureIndexExists(); // Ensure index exists before processing files

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

                try {
                    await fs.move(file.path, finalPath);
                } catch (moveError) {
                    console.error(`[Upload] Error moving file ${originalFileName} to ${finalPath}:`, moveError);
                    try { await fs.unlink(file.path); } catch (e) { console.error("[Upload] Error unlinking temp file after failed move:", e); }
                    continue;
                }

                const textContent = await readFileText(finalPath, ext.substring(1));

                if (!textContent || textContent.trim().length === 0) {
                    console.warn(`[Upload] No text extracted from ${finalPath}. Skipping.`);
                    continue;
                }

                const chunks = chunkText(textContent, CHUNK_SIZE); // Pass CHUNK_SIZE

                const validChunks = chunks.filter(chunk => chunk && chunk.trim().length > 0);
                if (validChunks.length === 0) {
                    console.warn(`[Upload] No valid (non-empty) chunks for ${finalPath}. Skipping.`);
                    continue;
                }
                 if (validChunks.length < chunks.length) {
                    console.warn(`[Upload] ${chunks.length - validChunks.length} empty chunks for ${finalPath} were filtered out before embedding.`);
                }


                let fileEmbeddings;
                try {
                    console.log(`[Upload] Getting embeddings for ${validChunks.length} valid chunks from file ${originalFileName}`);
                    fileEmbeddings = await getEmbeddingsForPipeline(validChunks); // Use new pipeline
                } catch (embeddingError) {
                    console.error(`[Upload] Embedding failed for ${originalFileName}. Error: ${embeddingError.message}. Skipping file.`);
                    continue; // Skip this file
                }

                if (!fileEmbeddings || fileEmbeddings.length !== validChunks.length) {
                    console.warn(`[Upload] Embedding count mismatch for ${originalFileName}. Expected ${validChunks.length}, got ${fileEmbeddings ? fileEmbeddings.length : 0}. Skipping file.`);
                    continue;
                }

                successfullyProcessedFiles++;

                for (let i = 0; i < validChunks.length; i++) {
                    const chunkToStore = validChunks[i];
                    const embedding = fileEmbeddings[i];
                    const docId = `${path.basename(finalName)}-chunk${i}`;

                    docsForBulkInsert.push({
                        index: { _index: OPENSEARCH_INDEX_NAME, _id: docId },
                    });
                    docsForBulkInsert.push({
                        doc_id: docId,
                        file_type: ext.substring(1),
                        file_path: finalPath,
                        text_chunk: chunkToStore,
                        embedding,
                    });
                    totalEmbeddedChunks++;
                }
            } // End of for (const file of files)

            if (docsForBulkInsert.length > 0) {
                console.log(`[Upload] Attempting bulk insert of ${docsForBulkInsert.length / 2} document chunks.`);
                const bulkResp = await osClient.bulk({ refresh: true, body: docsForBulkInsert });
                if (bulkResp.body.errors) {
                    console.error("[Upload] Bulk insert had errors. Logging first error item:");
                    const firstError = bulkResp.body.items.find(item => item.index && item.index.error);
                    console.error(JSON.stringify(firstError, null, 2));
                    return res.status(500).json({
                        error: "Bulk insert failed for some documents.",
                        details: "Check service logs for specific errors.",
                    });
                }
                res.json({
                    message: `Successfully processed ${successfullyProcessedFiles} files. Embedded and indexed ${totalEmbeddedChunks} document chunks.`,
                });
            } else if (successfullyProcessedFiles > 0) {
                res.status(200).json({
                    message: `Processed ${successfullyProcessedFiles} files, but no valid content could be embedded or indexed. Check file contents and logs.`,
                });
            } else {
                res.status(400).json({ error: "No files were processed or no valid content found in uploaded files." });
            }
        } catch (err) {
            console.error("[Upload] Critical endpoint error:", err);
            res.status(500).json({
                error: err.message || "An unexpected error occurred during upload.",
            });
        }
    }
);

/************ Start Server ***********/
app.listen(PORT, () => // Use PORT from .env
    console.log(`Embedding Service running on http://localhost:${PORT}`)
);

/************ Global Error Handlers ***********/
process.on("unhandledRejection", (reason, promise) => {
    console.error("[UnhandledRejection] Reason:", reason, "Promise:", promise);
    process.exit(1);
});

process.on("uncaughtException", (err, origin) => {
    console.error(`[UncaughtException] Error: ${err.message}\nOrigin: ${origin}\nStack: ${err.stack}`);
    process.exit(1);
});