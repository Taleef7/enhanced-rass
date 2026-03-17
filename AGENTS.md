# Repository Guidelines

## Project Structure & Module Organization
This repository is a multi-service RAG platform. `frontend/` contains the React UI (`src/components`, `src/api`, `src/context`). `mcp-server/` is the API gateway, auth layer, and Prisma-backed control plane. `rass-engine-service/` handles retrieval and answer generation. `embedding-service/` owns ingestion, chunking, and indexing. Shared docs live in `docs/`, evaluation tooling in `evaluation/`, helper scripts in `scripts/`, and local infrastructure in `docker-compose.yml`, `demo/`, and `monitoring/`.

## Build, Test, and Development Commands
Use the provided scripts instead of ad hoc Docker commands.

- `./scripts/start.sh`: build and start the backend stack with Docker Compose.
- `./scripts/stop.sh`: stop and remove the running stack.
- `cd frontend && npm install && npm start`: run the UI on `localhost:3000`.
- `cd frontend && npm run build`: create a production frontend build.
- `cd mcp-server && npm run validate:api`: validate `openapi.yaml` after route or contract changes.
- `cd mcp-server && npm test`
- `cd rass-engine-service && npm test`
- `cd embedding-service && npm test`

## Coding Style & Naming Conventions
Use 2-space indentation throughout. Preserve the existing module style by package: the frontend uses ES modules with React function components, while backend services use CommonJS. Name React components in PascalCase (`DocumentManager.js`), and keep utility and route modules in camelCase (`authMiddleware.js`, `chatApi.js`). Validate inputs with Zod, and treat runtime code as the source of truth when older phase docs drift. Frontend linting comes from `react-scripts`; Prettier is available in `frontend/`.

## Testing Guidelines
Jest is the primary test framework across backend services, and the frontend uses React Testing Library via `react-scripts test`. Place backend tests under `src/__tests__/` with `*.test.js` names; keep frontend component tests adjacent to source where that pattern already exists, such as `frontend/src/App.test.js`. When retrieval, ingestion, or generation behavior changes, also run the evaluation tooling in `evaluation/` before merging.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commit prefixes such as `feat:`, `fix:`, `docs:`, and `ci:`. Keep commits focused. Pull requests should describe the behavior change, note affected services, link related issues, and include screenshots for UI changes. Update docs when ports, auth flows, API contracts, or runtime topology change.

## Configuration & Security Tips
Keep secrets in `.env` and treat `config.yml` as shared non-secret runtime configuration. Do not commit credentials, generated tokens, or local environment overrides. If you change public endpoints or auth behavior, update `README.md`, `docs/getting-started.md`, and any impacted OpenAPI docs in the same PR.
