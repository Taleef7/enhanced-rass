// In frontend/src/apiClient.js
// Phase D: Token is managed in memory (AuthContext) rather than localStorage.
// All API calls that need auth accept a token parameter from useAuth().
import axios from "axios";

// Prefer a relative path so the dev proxy and production same-origin setups
// work without hardcoded host assumptions.
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "/api";

// Helper to read token from memory — falls back to localStorage for backward compat
// during the session migration period.
export const getAuthToken = () => {
  // This is kept for compatibility; prefer passing token directly from useAuth()
  return null; // No longer stored in localStorage (Phase D)
};

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Phase D: send refresh-token cookie automatically
  headers: {
    "Content-Type": "application/json",
  },
});

// --- Authentication Endpoints ---

export const registerUser = (username, password) => {
  return apiClient.post("/auth/register", { username, password });
};

export const loginUser = async (username, password) => {
  const response = await apiClient.post("/auth/login", { username, password });
  // Token is returned in the response body — caller stores it in AuthContext memory.
  // The server also sets an HTTP-only refresh-token cookie automatically.
  return response;
};

export const logoutUser = (token) => {
  return apiClient.post(
    "/auth/logout",
    {},
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
};

export const uploadFile = async (
  file,
  kbId = null,
  chunkingStrategy = null,
  token = null
) => {
  const formData = new FormData();
  formData.append("file", file);
  if (kbId) formData.append("kbId", kbId);
  if (chunkingStrategy) formData.append("chunkingStrategy", chunkingStrategy);

  const response = await fetch(`${API_BASE_URL}/embed-upload`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
    credentials: "include",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      data?.error || `Request failed with status code ${response.status}`
    );
    error.response = {
      status: response.status,
      data,
    };
    throw error;
  }

  return {
    data,
    status: response.status,
  };
};

export const pollIngestionStatus = (jobId, token = null) => {
  return apiClient.get(`/ingest/status/${jobId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
};

export const fetchDocuments = (page = 1, limit = 20, status = null, token = null) => {
  const params = { page, limit };
  if (status) params.status = status;
  return apiClient.get("/documents", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    params,
  });
};

export const deleteDocument = (documentId, token = null) => {
  return apiClient.delete(`/documents/${documentId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
};

export const fetchDocumentProvenance = (documentId, token = null) => {
  return apiClient.get(`/documents/${documentId}/provenance`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
};

export const fetchKnowledgeBases = (token = null) => {
  return apiClient.get("/knowledge-bases", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
};

export const createKnowledgeBase = (name, description = "", isPublic = false, token = null) => {
  return apiClient.post(
    "/knowledge-bases",
    { name, description, isPublic },
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
};

export const deleteKnowledgeBase = (kbId, token = null) => {
  return apiClient.delete(`/knowledge-bases/${kbId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
};

// --- Phase D: API Key Management ---

export const fetchApiKeys = (token = null) => {
  return apiClient.get("/api-keys", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
};

export const createApiKey = (name, expiresAt = null, token = null) => {
  return apiClient.post(
    "/api-keys",
    { name, expiresAt },
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
};

export const revokeApiKey = (keyId, token = null) => {
  return apiClient.delete(`/api-keys/${keyId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
};

// --- Phase D: Workspace Management ---

export const fetchOrganizations = (token = null) => {
  return apiClient.get("/organizations", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
};

export const createOrganization = (name, plan = "FREE", token = null) => {
  return apiClient.post(
    "/organizations",
    { name, plan },
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
};

export const fetchWorkspaces = (orgId, token = null) => {
  return apiClient.get(`/organizations/${orgId}/workspaces`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
};

export const createWorkspace = (orgId, name, quotaMb = 500, token = null) => {
  return apiClient.post(
    `/organizations/${orgId}/workspaces`,
    { name, quotaMb },
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
};

// --- Phase D: Admin / Audit Logs ---

export const fetchAuditLogs = (params = {}, token = null) => {
  return apiClient.get("/admin/audit-logs", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    params,
  });
};

const STREAM_MAX_RETRIES = 3;
const STREAM_BASE_DELAY_MS = 1000;

export const streamQuery = async (
  query,
  documents = [],
  onTextChunk,
  onSources,
  signal,
  token = null,
  onContext = null,
  onReconnecting = null,
  kbId = null
) => {
  let attempt = 0;

  while (attempt <= STREAM_MAX_RETRIES) {
    if (signal?.aborted) return;

    if (attempt > 0) {
      const delay = STREAM_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      onReconnecting && onReconnecting(attempt);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("AbortError", "AbortError"));
        }, { once: true });
      });
      if (signal?.aborted) return;
    }

    try {
      const body = { query };
      if (kbId) body.kbId = kbId;

      const response = await fetch("/api/stream-ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal,
        credentials: "include",
      });

      if (!response.ok) {
        // 4xx errors are not retryable
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        // 5xx: retry
        attempt++;
        continue;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const dataContent = line.substring(6).trim();
          if (dataContent === "[DONE]") break;

          try {
            const parsed = JSON.parse(dataContent);
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              onTextChunk(delta.content);
            } else if (delta.custom_meta) {
              const meta = delta.custom_meta;
              if (meta.type === "citations" && meta.citations) {
                onSources(meta.citations);
              } else if (meta.type === "context" && meta.chunks && onContext) {
                onContext(meta.chunks);
              }
            }
          } catch (e) {
            console.error("Error parsing stream data:", e);
          }
        }
      }
      return; // Success — exit retry loop
    } catch (e) {
      if (e.name === "AbortError") throw e;
      attempt++;
      if (attempt > STREAM_MAX_RETRIES) throw e;
      console.warn(`[streamQuery] attempt ${attempt} failed, retrying:`, e.message);
    }
  }
};

export default apiClient;

// Export API_BASE_URL for use in other modules
export { API_BASE_URL };

// New: Transcribe audio blob via backend Whisper endpoint
export const transcribeAudio = async (audioBlob, token = null) => {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");

  const response = await fetch(`${API_BASE_URL}/transcribe`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const msg = `HTTP error! status: ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  return data.text || "";
};
