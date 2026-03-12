# MCP Server

`mcp-server` is the application hub for RASS. It is more than an MCP transport layer: it owns auth, chat persistence, document governance, multi-tenancy, admin routes, and service proxying.

## Main responsibilities

- JWT login, refresh-token rotation, logout
- API key authentication
- Chat and message CRUD
- Document registry and provenance APIs
- Knowledge base and workspace management
- Audit, retention, and admin routes
- Feedback, annotations, and knowledge graph routes
- Upload proxy to `embedding-service`
- Streaming query proxy to `rass-engine-service`
- MCP JSON-RPC transport

## Runtime

- Port: `8080`
- Swagger UI: `http://localhost:8080/api/docs` in non-production
- Health: `GET /api/health`

## Auth behavior

Browser auth:

- `POST /api/auth/login` returns a JWT and sets a refresh-token cookie
- JWT is short-lived
- `POST /api/auth/refresh` rotates the refresh token and returns a fresh JWT

Machine auth:

- `Authorization: ApiKey <raw_key>`

Note: older docs referenced `X-Api-Key`. The live middleware expects the `Authorization` header with the `ApiKey` prefix.

## Important route groups

- `/api/auth/*`
- `/api/chats/*`
- `/api/embed-upload`
- `/api/stream-ask`
- `/api/documents/*`
- `/api/knowledge-bases/*`
- `/api/organizations/*`
- `/api/workspaces/*`
- `/api/api-keys/*`
- `/api/admin/*`
- `/api/feedback*`
- `/api/annotations*`
- `/api/entities/*`
- `/api/shared/*`
- `/mcp`

## Data ownership

`mcp-server` is the only service that talks to Postgres via Prisma. It owns the durable application model:

- users and sessions
- chats and messages
- document registry and provenance
- KB and workspace membership
- API keys and audit logs
- feedback, annotations, entities, relations, and shared chats

## Known caveats

- Shared-chat routes are not fully aligned with the current Prisma `Message` fields.
- The OpenAPI spec is useful, but runtime code remains the source of truth for edge behavior.
