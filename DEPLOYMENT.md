# RASS Project Deployment Guide

This document provides instructions for deploying and managing the RASS (Retrieval Augmented Semantic Search) application stack using Docker Compose and the provided management scripts.

## Prerequisites

Before you begin, ensure you have the following installed on your server (e.g., the Proxmox instance):

- Docker
- Docker Compose

## Configuration

The application requires environment variables to be set for its services.

1.  **Navigate to the service directories:** `embedding-service/` and `rass-engine-service/`.
2.  **Create `.env` files:** In each directory, copy the `.env.example` file (if it exists) to a new file named `.env`.
3.  **Fill in the variables:** Edit each `.env` file and provide the necessary values, such as your `OPENAI_API_KEY`, `GEMINI_API_KEY`, and any other required configurations.

## Running the Application

Management scripts are provided in the `scripts/` directory for convenience.

### To Start the Application:

Navigate to the root directory of the `enhanced-rass` project and run:

```bash
./scripts/start.sh
```

This command will build the Docker images if they've changed and start all services in the background.

### To Stop the Application:

From the project root, run:

```bash
./scripts/stop.sh
```

This command will gracefully stop and remove all running containers and the associated Docker network.

## Accessing Services

Once the application is running, the services are available at the following ports on the host machine:

- **MCP Server**: `http://localhost:8080` (This is the main endpoint for clients like Ozwell)
- **RASS Engine Service**: `http://localhost:8000` (Handles querying)
- **Embedding Service**: `http://localhost:8001` (Handles document ingestion)
- **Python Reranker Service**: `http://localhost:8008`
- **OpenSearch Database**: `http://localhost:9200`
