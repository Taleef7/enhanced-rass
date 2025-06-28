from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
from sentence_transformers import CrossEncoder
import uvicorn
import yaml # New import

# --- Centralized Configuration Loading ---
# Load the model name from the config.yml file mounted by Docker Compose
try:
    with open("config.yml", "r") as f:
        config = yaml.safe_load(f)
    MODEL_NAME = config.get("RERANKER_MODEL_NAME", "cross-encoder/ms-marco-MiniLM-L-6-v2")
    print(f"[Config] Loaded reranker model from config.yml: {MODEL_NAME}")
except FileNotFoundError:
    print("[Config] config.yml not found. Using default reranker model.")
    MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"
# --- End Configuration Loading ---

print(f"[Init] Loading CrossEncoder model: {MODEL_NAME}...")
model = CrossEncoder(MODEL_NAME)
print("[Init] Model loaded successfully.")

app = FastAPI()

class RerankRequest(BaseModel):
    query: str
    documents: List[str]
    top_k: int = None

class RerankResult(BaseModel):
    reranked: List[int]
    scores: List[float]

@app.post("/rerank", response_model=RerankResult)
def rerank(req: RerankRequest):
    if not req.documents or not req.query:
        raise HTTPException(status_code=400, detail="Missing query or documents.")
    pairs = [(req.query, doc) for doc in req.documents]
    scores = model.predict(pairs)
    reranked = sorted(enumerate(scores), key=lambda x: -x[1])
    indices = [i for i, _ in reranked]
    sorted_scores = [s for _, s in reranked]
    if req.top_k:
        indices = indices[:req.top_k]
        sorted_scores = sorted_scores[:req.top_k]
    return RerankResult(reranked=indices, scores=sorted_scores)

if __name__ == "__main__":
    # Load port from config, with a default
    port = config.get("RERANKER_PORT", 8008)
    uvicorn.run("rerank_service:app", host="0.0.0.0", port=port, reload=False)