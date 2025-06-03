/**********************************************************************
 *  embeddingService - Node.js OpenAI-based Embedding Microservice
 *********************************************************************/
const pdf = require("pdf-parse"); // Add this line
const mammoth = require("mammoth"); // Add this line
const fsPromises = require("fs").promises; // Add this for cleaner async file read
const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const sanitize = require("sanitize-filename");
const cookieParser = require("cookie-parser");
const { OpenAI } = require("openai");

const { Client: OSClient } = require("@opensearch-project/opensearch");
const fs = require("fs-extra");
const path = require("path");
const MarkdownIt = require("markdown-it");
const cheerio = require("cheerio");
const dotenv = require("dotenv");

/**************** Load ENV ****************/
dotenv.config();
const {
  OPENAI_API_KEY,
  OPENAI_API_URL,
  OPENAI_EMBED_MODEL = "text-embedding-ada-002",
  CHUNK_SIZE = 14000,
  EMBED_DIM = 1536,
  OPENSEARCH_HOST = "localhost",
  OPENSEARCH_PORT = 9200,
  OPENSEARCH_INDEX_NAME = "redmine_index",
  MAX_FILE_SIZE = 10485760,
  MAX_FILES_PER_REQUEST = 5,
  TEMP_DIR,
  UPLOAD_DIR,
} = process.env;

fs.ensureDirSync(UPLOAD_DIR);

if (TEMP_DIR) {
  // Ensure TEMP_DIR also exists if defined, as multer uses it
  fs.ensureDirSync(TEMP_DIR);
}

const app = express();
const openai = new OpenAI({ apiKey: OPENAI_API_KEY, baseURL: OPENAI_API_URL });
const osClient = new OSClient({
  node: `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}`,
});
const md = new MarkdownIt();

/**************** Middleware ***************/
app.use(express.json());
app.use(cookieParser());

const upload = multer({
  dest: TEMP_DIR,
  limits: { fileSize: Number(MAX_FILE_SIZE) },
});

/************ JWT Auth Middleware ***********/
// async function authenticateJWT(req, res, next) {
//     const cookies = req.cookies;
//     if (!cookies || !cookies.auth) return res.status(401).json({ error: 'No auth token' });

//     try {
//         const payload = jwt.verify(cookies.auth, JWT_SECRET);
//         const user = await prisma.user.findUnique({ where: { id: payload.sub } });
//         if (!user) throw new Error('User not found');
//         req.user = user;
//         next();
//     } catch (err) {
//         console.error('Authentication error:', err);
//         res.status(401).json({ error: 'Invalid token or user' });
//     }
// }

/************ Helper: Ensure OpenSearch Index ***********/
async function ensureIndexExists() {
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
          }, // Added ef_search here as well
        },
        mappings: {
          properties: {
            doc_id: { type: "keyword" },
            file_type: { type: "keyword" },
            file_path: { type: "keyword" },
            text_chunk: { type: "text" },
            embedding: {
              type: "knn_vector",
              dimension: Number(EMBED_DIM),
              method: {
                name: "hnsw",
                engine: "nmslib", // 'faiss' is often preferred if available & configured in OpenSearch
                space_type: "cosinesimil",
                parameters: { m: 48, ef_construction: 400 },
              },
            },
          },
        },
      },
    });
    console.log(`Created OpenSearch index '${OPENSEARCH_INDEX_NAME}'`);
  }
}

/************ Helper: Text Chunking ***********/
function chunkText(text, size = Number(CHUNK_SIZE)) {
  const chunks = [];
  if (typeof text !== "string") {
    // Added safety check for text type
    console.warn(
      "[chunkText] Input text is not a string. Returning empty chunks."
    );
    return chunks;
  }
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

/************ Helper: Read file text ***********/
async function readFileText(filePath, fileType) {
  let textContent = "";
  try {
    // Added try-catch for robustness
    if (fileType === "md") {
      const rawContent = await fsPromises.readFile(filePath, "utf8");
      const html = md.render(rawContent);
      const $ = cheerio.load(html);
      textContent = $("body").text();
    } else if (fileType === "pdf") {
      const dataBuffer = await fsPromises.readFile(filePath);
      if (dataBuffer.length === 0) {
        console.warn(`[readFileText] PDF file is empty: ${filePath}`);
        return "";
      }
      const data = await pdf(dataBuffer);
      textContent = data.text;
    } else if (fileType === "docx") {
      const result = await mammoth.extractRawText({ path: filePath });
      textContent = result.value;
      if (result.messages && result.messages.length > 0) {
        console.warn(`[readFileText] Mammoth messages for ${filePath}:`);
        result.messages.forEach((message) =>
          console.warn(`  - ${message.type}: ${message.message}`)
        );
      }
    } else if (fileType === "txt" || fileType === "json") {
      textContent = await fsPromises.readFile(filePath, "utf8");
    } else {
      console.warn(
        `[readFileText] Unsupported file type: ${fileType} for file: ${filePath}`
      );
      return "";
    }
  } catch (error) {
    console.error(
      `[readFileText] Error reading file ${filePath} (type: ${fileType}):`,
      error
    );
    return ""; // Return empty string on error to prevent downstream issues
  }
  return textContent;
}

/************ Helper: Embed text ***********/
async function embedText(text) {
  if (typeof text !== "string") {
    console.warn(
      "[embedText] Received non-string input. Attempting to coerce to string."
    );
    text = String(text || "");
  }

  if (!text.trim()) {
    console.warn(
      "[embedText] Empty or invalid text after trimming. Skipping embedding."
    );
    return []; // Return empty array if no embedding can be generated
  }

  try {
    // Added try-catch for API call
    const { data } = await openai.embeddings.create({
      model: OPENAI_EMBED_MODEL,
      input: text,
    });
    return data[0].embedding;
  } catch (error) {
    console.error("[embedText] OpenAI API error:", error.message);
    return []; // Return empty array on API error
  }
}

/************ POST /upload ***********/
app.post(
  "/upload",
  // authenticateJWT,
  upload.array("files", Number(MAX_FILES_PER_REQUEST)),
  async (req, res) => {
    try {
      const files = req.files;
      if (!files?.length)
        return res.status(400).json({ error: "No files uploaded" });

      await ensureIndexExists();

      const docs = [];
      let successfullyProcessedFiles = 0;

      for (const file of files) {
        const originalFileName = file.originalname || "unknown_file";
        const ext = path.extname(originalFileName).toLowerCase();

        // Updated to include '.pdf'
        if (![".txt", ".md", ".json", ".pdf", ".docx"].includes(ext)) {
          console.warn(
            `Unsupported file type '${ext}' skipped:`,
            originalFileName
          );
          // Clean up the temp file if it's not moved
          try {
            await fs.unlink(file.path);
          } catch (e) {
            console.error("Error unlinking skipped temp file:", e);
          }
          continue;
        }

        // Move file to permanent location
        const sanitizedName = sanitize(path.basename(originalFileName));
        const finalName = `${uuidv4()}_${sanitizedName}`;
        const finalPath = path.join(UPLOAD_DIR, finalName);

        try {
          await fs.move(file.path, finalPath); // Move file permanently
        } catch (moveError) {
          console.error(
            `Error moving file ${originalFileName} from temp to ${finalPath}:`,
            moveError
          );
          // If move fails, file.path might still exist in TEMP_DIR, multer might clean it or we could attempt here
          try {
            await fs.unlink(file.path);
          } catch (e) {
            console.error("Error unlinking temp file after failed move:", e);
          }
          continue; // Skip this file
        }

        const text = await readFileText(finalPath, ext.substring(1));

        if (!text || text.trim().length === 0) {
          console.warn(
            `No text content extracted from ${finalPath} (type: ${ext}). Skipping.`
          );
          continue;
        }

        const chunks = chunkText(text);

        if (chunks.length === 0) {
          console.warn(`No chunks generated for ${finalPath}. Skipping.`);
          continue;
        }
        successfullyProcessedFiles++;

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          if (!chunk || chunk.trim().length === 0) {
            // Ensure chunk is not empty
            console.warn(
              `Empty chunk for ${finalPath} at index ${i}. Skipping.`
            );
            continue;
          }
          const embedding = await embedText(chunk);

          // Only proceed if embedding was successful
          if (embedding && embedding.length > 0) {
            const docId = `${path.basename(finalName)}-${i}`;
            docs.push({
              index: { _index: OPENSEARCH_INDEX_NAME, _id: docId },
            });
            docs.push({
              doc_id: docId,
              file_type: ext.substring(1),
              file_path: finalPath, // Storing the path in UPLOAD_DIR
              text_chunk: chunk,
              embedding,
            });
          } else {
            console.warn(
              `Failed to generate embedding for a chunk in ${finalPath}. Skipping chunk.`
            );
          }
        }
      }

      if (docs.length > 0) {
        const resp = await osClient.bulk({ refresh: true, body: docs });
        if (resp.body.errors) {
          // Simplified error logging for bulk
          console.error(
            "Bulk insert had errors. First error:",
            JSON.stringify(
              resp.body.items.find((item) => item.index && item.index.error),
              null,
              2
            )
          );
          return res.status(500).json({
            error: "Bulk insert had errors",
            details: "Check service logs.",
          });
        }
        console.log(
          `Bulk operation attempted for ${docs.length / 2} document chunks.`
        );
        res.json({
          message: `Processed ${successfullyProcessedFiles} files. Embedded and indexed ${
            docs.length / 2
          } document chunks.`,
        });
      } else if (successfullyProcessedFiles > 0) {
        // Files were processed, but no valid chunks/embeddings were generated (e.g. all chunks were empty or embedding failed for all)
        res.status(200).json({
          message: `Processed ${successfullyProcessedFiles} files, but no valid content could be embedded or indexed. Check file contents and embedding logs.`,
        });
      } else {
        console.warn("No valid documents to process or index.");
        res
          .status(400)
          .json({ error: "No valid documents provided or processed." });
      }
    } catch (err) {
      console.error("Upload endpoint error:", err);
      res.status(500).json({
        error: err.message || "An unexpected error occurred during upload.",
      });
    }
  }
);

/************ Start Server ***********/
const PORT = process.env.PORT || 8001; // Use environment variable for port or default
app.listen(PORT, () =>
  console.log(`Embedding Service running on http://localhost:${PORT}`)
);

/************ Global Error Handler ***********/
process.on("unhandledRejection", (reason, promise) => {
  // Added reason and promise for better context
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Application specific logging, throwing an error, or other logic here
  process.exit(1); // Still exiting, but with more info
});

process.on("uncaughtException", (err, origin) => {
  // Added origin for better context
  console.error(
    `Uncaught Exception: ${err.message}\n` +
      `Exception origin: ${origin}\n` +
      `Stack: ${err.stack}`
  );
  fs.writeSync(
    process.stderr.fd,
    `Caught exception: ${err}\nException origin: ${origin}`
  ); // Also log to stderr
  process.exit(1);
});
