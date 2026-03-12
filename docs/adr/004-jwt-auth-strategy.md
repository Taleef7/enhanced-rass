# ADR 004: Short-Lived JWTs in Memory with Refresh-Token Cookies

**Date:** 2025-01-15  
**Status:** Accepted

## Context

RASS needs:

- browser auth that avoids persistent token storage
- silent session restoration
- machine-to-machine authentication

## Decision

Use:

- short-lived JWT access tokens stored in frontend application memory
- rotating HTTP-only refresh-token cookies
- API keys for machine clients

## Why

- Access tokens are not persisted in browser storage.
- Refresh tokens are HTTP-only and rotated on use.
- API keys fit automation and service integrations better than browser session semantics.

## Important clarification

The JWT is stored in frontend memory, not localStorage and not an HTTP-only cookie.

That means:

- it is not persisted across page reloads
- it is recovered through `POST /api/auth/refresh`
- it is less exposed than localStorage persistence
- it is still accessible to frontend JavaScript while the app is running

So the benefit is reduced persistence and smaller theft window, not total immunity from XSS.

## Consequences

- Better than long-lived localStorage tokens for the current UI architecture
- Requires refresh on reload
- Requires HTTPS in production so cookies can be `Secure`
- Adds database-backed refresh-token rotation

## Runtime shape

Login:

```text
POST /api/auth/login -> { token } + Set-Cookie refreshToken
```

Refresh:

```text
POST /api/auth/refresh -> { token } + rotated refresh cookie
```

Machine auth:

```text
Authorization: ApiKey rass_...
```
