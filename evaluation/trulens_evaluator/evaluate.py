# evaluate.py
import os
from pathlib import Path
from dotenv import load_dotenv
import time

# Construct the path to the root .env file (two levels up)
env_path = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

import requests
import pandas as pd
import numpy as np

# Updated TruLens imports for a custom RAG application
from trulens.core.session import TruSession
from trulens.apps.custom import TruCustomApp
from trulens.apps.app import instrument
from trulens.core import Feedback, Select
from trulens.providers.openai import OpenAI

# --- RASS API Wrapper (Now an instrumented class) ---
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
            # Increased timeout for potentially slower, higher-quality models
            response = requests.post(self.engine_url, json={"query": query, "top_k": 12}, timeout=60)
            response.raise_for_status()
            data = response.json()
            
            answer = data.get("answer", "No answer found.")
            source_docs = data.get('source_documents', [])
            
            # --- ROBUST CONTEXT EXTRACTION ---
            # This handles cases where docs might be structured differently or be empty.
            context_list = []
            if source_docs and isinstance(source_docs, list):
                for doc in source_docs:
                    # Check for nested text fields common in RAG responses
                    if isinstance(doc, dict):
                        text = doc.get('_source', {}).get('text') or doc.get('text')
                        if text:
                            context_list.append(str(text))
            
            context = "\n\n".join(context_list)
            
            # If after all that the context is still empty, log a warning.
            if not context:
                print(f"Warning: No text found in source_documents for query: '{query}'")

            return {"answer": answer, "context": context}
            
        except requests.exceptions.RequestException as e:
            print(f"Error calling RASS Engine: {e}")
            return {"answer": f"Error: {e}", "context": ""}

# --- TruLens Setup (Upgraded for the RAG Triad) ---
def setup_trulens_evaluator():
    provider = OpenAI()

    select_context = Select.Record.app.query_with_context.rets.context
    select_answer = Select.Record.app.query_with_context.rets.answer

    f_groundedness = (
        Feedback(provider.groundedness_measure_with_cot_reasons, name="Groundedness")
        .on(source=select_context)
        .on(statement=select_answer)
    )

    f_answer_relevance = (
        Feedback(provider.relevance, name="Answer Relevance")
        .on_input()
        .on(select_answer)
    )

    f_context_relevance = (
        Feedback(provider.context_relevance, name="Context Relevance")
        .on_input()
        .on(select_context)
        .aggregate(np.mean)
    )
    
    return [f_groundedness, f_answer_relevance, f_context_relevance]

# --- Main Evaluation Logic ---
if __name__ == "__main__":
    if not os.environ.get("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY environment variable not set. Check your .env file path and contents.")
        exit(1)
    
    print("Please ensure all RASS services are running...")
    
    session = TruSession()
    session.reset_database()
    
    feedbacks = setup_trulens_evaluator()
    rass_app = RASS_App()

    tru_recorder = TruCustomApp(
        rass_app,
        app_id="Enhanced RASS - Industry Best Practices", 
        feedbacks=feedbacks
    )

    # --- NEW: Expanded and more comprehensive evaluation questions ---
    evaluation_questions = [
        # 1. Simple Factual Recall
        "What weapon did the Martians use that generated immense heat?",
        # 2. Specific Factual Recall
        "How did the Martians arrive on Earth?",
        # 3. Nuanced Factual Recall (testing for deeper understanding)
        "What was the ultimate cause of the Martians' defeat?",
        # 4. Descriptive Question
        "Describe the appearance of the Martian handling-machine.",
        # 5. Event-based Question
        "What happened to the ship named the Thunder Child?",
        # 6. Character-focused Question
        "What role did the narrator's brother play in the story?",
        # 7. Negative Case (In-Domain) - To test for hallucination
        "Did the humans successfully destroy a Martian Tripod using artillery?",
        # 8. Negative Case (Out-of-Domain) - To confirm it knows its limits
        "What is the capital of Australia?",
    ]

    print("--- Starting Enhanced RASS Evaluation ---")
    
    for i, question in enumerate(evaluation_questions, 1):
        print(f"\n[Question {i}/{len(evaluation_questions)}]: {question}")
        
        with tru_recorder as recording:
            response_dict = rass_app.query_with_context(question)
            print(f"[Answer]: {response_dict['answer'][:200]}...")
        
        print("Waiting 5 seconds to avoid rate limiting...")
        time.sleep(5) # Wait for 5 seconds before the next question

    print("\n--- Evaluation Complete ---")
    
    print("\nLaunching TruLens Dashboard...")
    session.run_dashboard()