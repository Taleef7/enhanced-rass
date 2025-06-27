import os
import requests
import pandas as pd
import numpy as np

# TruLens imports
from trulens.core.session import TruSession
from trulens.apps.basic import TruBasicApp
from trulens.core import Feedback
from trulens.providers.openai import OpenAI

# --- RASS API Wrapper ---
def rass_query_app(query: str) -> str:
    """
    Simple function that sends a query to the RASS engine.
    Returns just the answer string for basic evaluation.
    """
    engine_url = "http://localhost:8000/ask"
    
    try:
        response = requests.post(engine_url, json={"query": query, "top_k": 5})
        response.raise_for_status()
        data = response.json()
        
        answer = data.get("answer", "No answer found.")
        return answer
        
    except requests.exceptions.RequestException as e:
        print(f"Error calling RASS Engine: {e}")
        return f"Error: {e}"

# --- TruLens Setup ---
def setup_trulens_evaluator():
    # Initialize the OpenAI provider
    provider = OpenAI()

    # Define basic feedback functions for simple input->output evaluation
    # For TruBasicApp with string output, we use the simple selectors
    
    # Answer Relevance - compares input query to output answer
    f_answer_relevance = (
        Feedback(provider.relevance, name="Answer Relevance")
        .on_input_output()  # input=prompt, output=response
    )

    return [f_answer_relevance]

# --- Main Evaluation Logic ---
if __name__ == "__main__":
    # Check for OpenAI API key
    if not os.environ.get("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY environment variable not set.")
        print("Please set your OpenAI API key: export OPENAI_API_KEY='your-key-here'")
        exit(1)
    
    print("Please ensure all RASS services are running...")
    
    # Initialize a TruLens Session
    session = TruSession()
    session.reset_database()
    
    # Get the feedback functions
    feedbacks = setup_trulens_evaluator()

    # Wrap the function with TruBasicApp for evaluation
    # Disable selector checking since we're returning simple strings
    tru_app_recorder = TruBasicApp(
        rass_query_app,
        app_name="RASS Engine",
        app_version="v1.0",
        feedbacks=feedbacks,
        selectors_nocheck=True  # This disables the selector validation that's causing errors
    )

    # Define your evaluation questions
    evaluation_questions = [
        "How are the Martians ultimately defeated?",
        "What is the most prominent feature of Seattle's skyline?", 
        "What is the capital of New Zealand?",
        "Describe the Martian handling-machine."
    ]

    print("--- Starting RASS Evaluation with TruLens ---")
    
    # Run the evaluation
    for i, question in enumerate(evaluation_questions, 1):
        print(f"\n[Question {i}/{len(evaluation_questions)}]: {question}")
        
        with tru_app_recorder as recording:
            response = tru_app_recorder.app(question)
            print(f"[Answer]: {response[:200]}{'...' if len(response) > 200 else ''}")

    print("\n--- Evaluation Complete ---")
    
    # Show some basic results
    try:
        records, feedback = session.get_records_and_feedback(app_ids=["RASS Engine"])
        print(f"\nProcessed {len(records)} questions")
        print(f"Generated {len(feedback)} feedback entries")
        
        if feedback:
            # Show average scores
            df = pd.DataFrame(feedback)
            if not df.empty and 'result' in df.columns:
                avg_scores = df.groupby('name')['result'].mean()
                print("\nAverage Feedback Scores:")
                for name, score in avg_scores.items():
                    print(f"  {name}: {score:.3f}")
    except Exception as e:
        print(f"Error retrieving results: {e}")
    
    # Launch the TruLens dashboard
    print("\nLaunching TruLens Dashboard...")
    print("You can view detailed results at: http://localhost:8501")
    try:
        session.run_dashboard()
    except KeyboardInterrupt:
        print("\nDashboard stopped by user.")
    except Exception as e:
        print(f"Error launching dashboard: {e}")
        print("You can manually run: from trulens.dashboard import run_dashboard; run_dashboard()")