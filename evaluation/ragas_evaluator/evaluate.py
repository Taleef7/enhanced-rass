# evaluation/ragas_evaluator/evaluate.py
import os
import sys
import json
from dotenv import load_dotenv
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy

# Construct paths to the .env files relative to this script's location
# and load them explicitly.
script_dir = os.path.dirname(os.path.abspath(__file__))

# Path to the .env file in the embedding-service directory
embedding_env_path = os.path.join(script_dir, '..', '..', 'embedding-service', '.env')
# Path to the .env file in the rass-engine-service directory
rass_engine_env_path = os.path.join(script_dir, '..', '..', 'rass-engine-service', '.env')

print(f"Loading environment variables from: {embedding_env_path}")
load_dotenv(dotenv_path=embedding_env_path)
print(f"Loading environment variables from: {rass_engine_env_path}")
# Loading this second will ensure rass-engine's keys take precedence if they differ
load_dotenv(dotenv_path=rass_engine_env_path)


def main():
    """
    Reads a JSON file with evaluation data, runs RAGAS, and prints the results as JSON.
    """
    # --- THIS IS THE FIX ---
    # Print all status messages to stderr, so stdout contains only the final JSON.
    print("Loading environment variables...", file=sys.stderr)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    embedding_env_path = os.path.join(script_dir, '..', '..', 'embedding-service', '.env')
    rass_engine_env_path = os.path.join(script_dir, '..', '..', 'rass-engine-service', '.env')
    load_dotenv(dotenv_path=embedding_env_path)
    load_dotenv(dotenv_path=rass_engine_env_path)
    print("Environment variables loaded.", file=sys.stderr)
    # --- END FIX ---

    if len(sys.argv) < 2:
        sys.exit(1)
        
    data_file_path = sys.argv[1]

    try:
        with open(data_file_path, 'r') as f:
            eval_data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        sys.exit(1)

    from ragas.llms import llm_factory
    from ragas.embeddings import embedding_factory

    os.environ["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY", "")
    os.environ["GEMINI_API_KEY"] = os.getenv("GEMINI_API_KEY", "")

    ragas_llm = llm_factory(model=os.getenv("OPENAI_PLANNER_MODEL_NAME", "gpt-3.5-turbo"))
    ragas_embeddings = embedding_factory(model=os.getenv("OPENAI_EMBED_MODEL_FOR_SEARCH_TERMS", "text-embedding-ada-002"))

    dataset_dict = {
        "question": [item["question"] for item in eval_data],
        "answer": [item["answer"] for item in eval_data],
        "contexts": [[str(doc) for doc in item["contexts"]] for item in eval_data],
        "ground_truth": [item.get("ground_truth", "") for item in eval_data]
    }
    dataset = Dataset.from_dict(dataset_dict)

    metrics = [
        faithfulness,
        answer_relevancy,
    ]
    
    print("Running RAGAS evaluation...", file=sys.stderr)
    
    result = evaluate(
        dataset=dataset,
        metrics=metrics,
        llm=ragas_llm,
        embeddings=ragas_embeddings,
        raise_exceptions=False 
    )

    print("Evaluation complete.", file=sys.stderr)
    
    # This now prints the final, clean JSON to stdout
    print(json.dumps(result.scores))

if __name__ == "__main__":
    main()