from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
from sentence_transformers import CrossEncoder
import uvicorn

# Use a smaller, memory-efficient model
MODEL_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"
model = CrossEncoder(MODEL_NAME)

app = FastAPI()

class RerankRequest(BaseModel):
    query: str
    documents: List[str]
    top_k: int = None  # Optional: return top_k results

class RerankResult(BaseModel):
    reranked: List[int]  # Indices of reranked documents
    scores: List[float]  # Corresponding scores

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
    uvicorn.run("rerank_service:app", host="0.0.0.0", port=8008, reload=False)
