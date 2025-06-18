// rass-engine-service/reranker.js
const { pipeline } = require("@huggingface/transformers");

// This is a singleton class to ensure we only load the model once.
class RerankerPipeline {
    static instance = null;

    // The task is 'text-classification' for rerankers, but we can also use 'feature-extraction'
    // or other tasks depending on the model. For rerankers, this is often the right choice.
    static task = 'text-classification';
    
    // We'll use a lightweight but powerful reranker model.
    static model = 'Xenova/mxbai-rerank-xsmall-v1';

    static async getInstance() {
        if (this.instance === null) {
            console.log("[Reranker] Initializing reranker model for the first time...");
            this.instance = pipeline(this.task, this.model);
            console.log("[Reranker] Model initialized successfully.");
        }
        return this.instance;
    }
}

/**
 * Reranks a list of documents based on their relevance to a query using a cross-encoder model.
 * @param {string} query The user's query.
 * @param {Array<object>} documents The list of documents retrieved from the initial search. Each object must have a 'text' property.
 * @returns {Promise<Array<object>>} A new list of documents, sorted by relevance score.
 */
async function rerank(query, documents) {
    if (!documents || documents.length === 0) {
        return [];
    }

    try {
        console.log(`[Reranker] Starting reranking for ${documents.length} documents...`);
        const reranker = await RerankerPipeline.getInstance();

        // Create pairs of [query, document_text] for the model
        const sentencePairs = documents.map(doc => [query, doc.text]);

        // The model will return scores for each pair. top_k=null returns all scores.
        const results = await reranker(sentencePairs, { top_k: null });

        // Add the rerank score to each original document
        const documentsWithScores = documents.map((doc, i) => {
            // Find the score for the 'positive' label, which indicates relevance.
            const positiveResult = results[i].find(res => res.label === 'positive');
            return {
                ...doc,
                rerank_score: positiveResult ? positiveResult.score : 0,
            };
        });

        // Sort documents by the new rerank_score in descending order
        const sortedDocuments = documentsWithScores.sort((a, b) => b.rerank_score - a.rerank_score);
        
        console.log(`[Reranker] Reranking complete.`);
        return sortedDocuments;

    } catch (error) {
        console.error("[Reranker] An error occurred during the reranking process:", error);
        // If reranking fails, return the original documents to avoid breaking the entire flow.
        return documents;
    }
}

module.exports = { rerank };