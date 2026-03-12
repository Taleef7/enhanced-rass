# ADR 004: JWT Access Tokens with HTTP-Only Refresh Token Cookies

**Date:** 2025-01-15
**Status:** Accepted
**Author:** RASS Architecture Team

## Context

RASS serves a web frontend and machine-to-machine API clients. Authentication must:
- Prevent XSS-based token theft from the browser
- Allow silent token refresh without UX interruption
- Support API key auth for non-browser integrations
- Work across all modern browsers

Three strategies were evaluated:
1. Long-lived JWT stored in `localStorage`
2. Session cookie (server-side session store)
3. **Short-lived JWT in memory + HTTP-only refresh token cookie**

## Decision

Use **short-lived JWTs (15 min TTL) stored in application memory** plus an **HTTP-only, SameSite=Strict refresh token cookie (7 day TTL)**.

Additionally, support **hashed API keys** (stored in Postgres, checked server-side) for machine-to-machine integrations.

## Rationale

### Short JWT in memory
- Not accessible to JavaScript → immune to XSS attacks
- 15-minute TTL limits blast radius of any leak

### HTTP-only refresh cookie
- Browser enforces no JavaScript access
- `SameSite=Strict` prevents CSRF attacks
- Cookie is automatically sent on same-origin requests to `/api/auth/refresh`
- Server rotates refresh tokens on each use (one-time tokens), limiting replay attack windows

### API Keys for M2M
- Long-lived, scoped tokens for CI/CD pipelines, internal services
- Stored as bcrypt/SHA-256 hashes — raw value shown once at creation
- Revocable at any time via `DELETE /api/api-keys/:id`

## Consequences

- **Positive**: Defense-in-depth against XSS (no token in localStorage).
- **Positive**: CSRF protection via SameSite cookie attribute.
- **Positive**: Silent token refresh via interceptor (transparent to UX).
- **Negative**: Requires HTTPS in production (cookies with `Secure` flag).
- **Negative**: Page refresh loses in-memory token → requires refresh call on mount.
- **Negative**: Stateful refresh tokens require a database lookup per refresh (vs. fully stateless JWT).
- **Mitigation**: Axios response interceptor handles 401 → silent refresh → retry automatically.

## Implementation

```
Login:
  POST /api/auth/login → { token: <15min JWT> }  + Set-Cookie: refreshToken=<7d>; HttpOnly; SameSite=Strict

Silent refresh:
  POST /api/auth/refresh (cookie sent automatically) → { token: <new JWT> }

Frontend:
  axios.interceptors.response.use(
    ok => ok,
    async err => {
      if (err.response?.status === 401 && !err.config._retry) {
        err.config._retry = true;
        const { token } = await authAPI.refresh();
        setToken(token);
        err.config.headers.Authorization = `Bearer ${token}`;
        return axios(err.config);
      }
      throw err;
    }
  );
```

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| `localStorage` JWT | XSS-vulnerable; any third-party script can steal the token |
| Server-side session | Requires Redis session store; more complex horizontal scaling |
| `sessionStorage` JWT | Lost on tab close; poor UX; still XSS-vulnerable |
