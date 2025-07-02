import os
import requests
import pandas as pd
import numpy as np

# Updated TruLens imports for a custom RAG application
from trulens.core.session import TruSession
from trulens.apps.custom import TruCustomApp
# *** THIS IS THE FIX: Correct import path for the decorator ***
from trulens.apps.app import instrument
from trulens.core import Feedback, Select
from trulens.providers.openai import OpenAI

# --- RASS API Wrapper (Now an instrumented class) ---
# By decorating the query method, we allow TruLens to see its inputs and outputs.
class RASS_App:
    def __init__(self):
        self.engine_url = "http://localhost:8000/ask"

    @instrument
    def query_with_context(self, query: str) -> dict:
        """
        This method is now instrumented. TruLens will track its inputs,
        and its full dictionary output (answer and context).
        """
        try:
            # Increased top_k for better context coverage
            response = requests.post(self.engine_url, json={"query": query, "top_k": 8})
            response.raise_for_status()
            data = response.json()
            
            answer = data.get("answer", "No answer found.")
            # Extract the page_content from each source document for evaluation
            context_list = [doc.get('text', '') for doc in data.get('source_documents', [])]
            context = "\n".join(context_list)
            
            return {"answer": answer, "context": context}
        except requests.exceptions.RequestException as e:
            print(f"Error calling RASS Engine: {e}")
            return {"answer": f"Error: {e}", "context": ""}

# --- TruLens Setup (Upgraded for the RAG Triad) ---
def setup_trulens_evaluator():
    provider = OpenAI()

    # Define selectors for the instrumented 'query_with_context' method
    select_context = Select.Record.app.query_with_context.rets.context
    select_answer = Select.Record.app.query_with_context.rets.answer

    # 1. Groundedness: Is the answer supported by the context?
    f_groundedness = (
        Feedback(provider.groundedness_measure_with_cot_reasons, name="Groundedness")
        .on(source=select_context)
        .on(statement=select_answer)
    )

    # 2. Answer Relevance: Is the answer relevant to the user's query?
    f_answer_relevance = (
        Feedback(provider.relevance, name="Answer Relevance")
        .on_input()
        .on(select_answer)
    )

    # 3. Context Relevance: Is the retrieved context relevant to the user's query?
    f_context_relevance = (
        Feedback(provider.context_relevance, name="Context Relevance")
        .on_input()
        .on(select_context)
        .aggregate(np.mean)
    )
    
    # The full RAG Triad for comprehensive evaluation
    return [f_groundedness, f_answer_relevance, f_context_relevance]

# --- Main Evaluation Logic ---
if __name__ == "__main__":
    if not os.environ.get("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY environment variable not set.")
        exit(1)
    
    print("Please ensure all RASS services are running...")
    
    session = TruSession()
    session.reset_database()
    
    feedbacks = setup_trulens_evaluator()
    rass_app = RASS_App()

    # Use TruCustomApp to wrap our instrumented RASS_App class
    tru_recorder = TruCustomApp(
        rass_app,
        app_id="RASS Engine - Optimized Reranker", # New app_id for comparison
        feedbacks=feedbacks
    )

    # **REPLACED** - More targeted evaluation questions
    evaluation_questions = [
        # Question 1: Factual recall from the text
        "How are the Martians ultimately defeated in The War of the Worlds?",
        # Question 2: More specific factual recall
        "What weapon did the Martians use that generated immense heat?",
        # Question 3: Descriptive question
        "Describe the appearance of the Martian handling-machine.",
        # Question 4: Out-of-domain question to test for hallucinations
        "What is the primary export of Brazil?",
    ]

    print("--- Starting RASS Evaluation with Optimized Reranker ---")
    
    for i, question in enumerate(evaluation_questions, 1):
        print(f"\n[Question {i}/{len(evaluation_questions)}]: {question}")
        
        with tru_recorder as recording:
            response_dict = rass_app.query_with_context(question)
            print(f"[Answer]: {response_dict['answer'][:200]}...")

    print("\n--- Evaluation Complete ---")
    
    print("\nLaunching TruLens Dashboard...")
    session.run_dashboard()