/**********************************************************************
 *  embeddingService - Node.js OpenAI-based Embedding Microservice
 *********************************************************************/
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const sanitize = require('sanitize-filename');
const cookieParser = require('cookie-parser');
const { OpenAI } = require('openai');

const { Client: OSClient } = require('@opensearch-project/opensearch');
const fs = require('fs-extra');
const path = require('path');
const MarkdownIt = require('markdown-it');
const cheerio = require('cheerio');
const dotenv = require('dotenv');

/**************** Load ENV ****************/
dotenv.config();
const {
    OPENAI_API_KEY,
    OPENAI_API_URL,
    OPENAI_EMBED_MODEL = 'text-embedding-ada-002',
    CHUNK_SIZE = 14000,
    EMBED_DIM = 1536,
    OPENSEARCH_HOST = 'localhost',
    OPENSEARCH_PORT = 9200,
    OPENSEARCH_INDEX_NAME = 'redmine_index',
    MAX_FILE_SIZE = 10485760,
    MAX_FILES_PER_REQUEST = 5,
    TEMP_DIR,
    UPLOAD_DIR,
} = process.env;

fs.ensureDirSync(UPLOAD_DIR);

const app = express();
const openai = new OpenAI({ apiKey: OPENAI_API_KEY, baseURL: OPENAI_API_URL });
const osClient = new OSClient({ node: `http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}` });
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
    const exists = await osClient.indices.exists({ index: OPENSEARCH_INDEX_NAME });
    if (!exists.body) {
        await osClient.indices.create({
            index: OPENSEARCH_INDEX_NAME,
            body: {
                settings: {
                    index: { knn: true, number_of_shards: 1, number_of_replicas: 0 },
                },
                mappings: {
                    properties: {
                        doc_id: { type: 'keyword' },
                        file_type: { type: 'keyword' },
                        file_path: { type: 'keyword' },
                        text_chunk: { type: 'text' },
                        embedding: {
                            type: 'knn_vector',
                            dimension: Number(EMBED_DIM),
                            method: {
                                name: 'hnsw',
                                engine: 'nmslib',
                                space_type: 'cosinesimil',
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
    for (let i = 0; i < text.length; i += size) {
        chunks.push(text.slice(i, i + size));
    }
    return chunks;
}

/************ Helper: Read file text ***********/
async function readFileText(filePath, fileType) {
    const content = await fs.readFile(filePath, 'utf8');
    if (fileType === 'md') {
        const html = md.render(content);
        const $ = cheerio.load(html);
        return $('body').text();
    }
    return content;
}

/************ Helper: Embed text ***********/
// async function embedText(text) {
//     if (!text.trim()) return Array(Number(EMBED_DIM)).fill(0);

//     // Safeguard: limit max text length
//     const safeText = text.length > 15000 ? text.slice(0, 15000) : text;  // ~15000 chars ~ 4000 tokens

//     const { data } = await openai.embeddings.create({
//         model: OPENAI_EMBED_MODEL,
//         input: safeText,
//     });

//     const emb = data[0].embedding;
//     // normalize
//     const norm = Math.sqrt(emb.reduce((sum, x) => sum + x * x, 0)) + 1e-10;
//     return emb.map(x => x / norm);
// }


async function embedText(text) {
    if (typeof text !== 'string') {
        console.warn('[embedText] Received non-string input. Attempting to coerce to string.');
        text = String(text || '');
    }

    if (!text.trim()) {
        console.warn('[embedText] Empty or invalid text after trimming.');
        // return Array(Number(EMBED_DIM)).fill(0);
        return [];
    }

    const { data } = await openai.embeddings.create({
        model: OPENAI_EMBED_MODEL,
        input: text,
    });

    return data[0].embedding;
}


/************ POST /upload ***********/
app.post('/upload',
    // authenticateJWT, 
    upload.array('files', Number(MAX_FILES_PER_REQUEST)), async (req, res) => {
        try {
            const files = req.files;
            if (!files?.length) return res.status(400).json({ error: 'No files uploaded' });

            await ensureIndexExists();

            const docs = [];
            for (const file of files) {
                const ext = path.extname(file.originalname).toLowerCase();
                if (!['.txt', '.md', '.json'].includes(ext)) {
                    console.warn('Unsupported file skipped:', file.originalname);
                    continue;
                }

                // Move file to permanent location
                const sanitizedName = sanitize(path.basename(file.originalname));
                const finalName = `${uuidv4()}_${sanitizedName}`;
                const finalPath = path.join(UPLOAD_DIR, finalName);
                await fs.move(file.path, finalPath); // Move file permanently

                const text = await readFileText(finalPath, ext.substring(1));
                const chunks = chunkText(text);

                for (let i = 0; i < chunks.length; i++) {
                    const chunk = chunks[i];
                    const embedding = await embedText(chunk);
                    const docId = `${path.basename(finalName)}-${i}`;

                    docs.push({
                        index: { _index: OPENSEARCH_INDEX_NAME, _id: docId },
                    });
                    docs.push({
                        doc_id: docId,
                        file_type: ext.substring(1),
                        file_path: finalPath,
                        text_chunk: chunk,
                        embedding,
                    });
                }
            }

            if (docs.length) {
                // console.log('Bulk request body:', JSON.stringify(docs, null, 2));
                const resp = await osClient.bulk({ refresh: true, body: docs });

                // console.log('Bulk response:', JSON.stringify(resp, null, 2));
                if (resp.body.errors) {
                    for (const item of resp.body.items) {
                        const action = Object.keys(item)[0];
                        if (item[action].error) {
                            console.error(`Failed to index document:`, JSON.stringify(item[action].error, null, 2));
                        }
                    }
                    return res.status(500).json({ error: 'Bulk insert had errors', details: resp.body.items });
                }

                console.log(`Bulk inserted ${docs.length / 2} documents.`);
                return res.json({ message: `Embedded and indexed ${docs.length / 2} documents.` });
            }

            // If no docs at all
            console.warn('No valid documents to insert.');
            return res.status(400).json({ error: 'No valid documents uploaded.' });
        } catch (err) {
            console.error('Upload error:', err);
            res.status(500).json({ error: err.message });
        }
    });

/************ Start Server ***********/
const PORT = 8001;
app.listen(PORT, () => console.log(`Embedding Service running on http://localhost:${PORT}`));

/************ Global Error Handler ***********/
process.on('unhandledRejection', err => {
    console.error('Unhandled rejection:', err);
    process.exit(1);
});

process.on('uncaughtException', err => {
    console.error('Uncaught exception:', err);
    process.exit(1);
});
