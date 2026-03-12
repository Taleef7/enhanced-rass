// In frontend/src/apiClient.js
// Phase D: Token is managed in memory (AuthContext) rather than localStorage.
// All API calls that need auth accept a token parameter from useAuth().
import axios from "axios";

// The base URL for all our backend requests
const API_BASE_URL = "http://localhost:8080/api";

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

export const uploadFile = (file, kbId = null, chunkingStrategy = null, token = null) => {
  const formData = new FormData();
  formData.append("file", file);
  if (kbId) formData.append("kbId", kbId);
  if (chunkingStrategy) formData.append("chunkingStrategy", chunkingStrategy);

  return apiClient.post("/embed-upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
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

export const streamQuery = async (
  query,
  documents = [],
  onTextChunk,
  onSources,
  signal,
  token = null,
  onContext = null
) => {
  const response = await fetch("/api/stream-ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query }),
    signal,
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
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
            // Phase F (#129): "What RASS is thinking" context chunks
            onContext(meta.chunks);
          }
        }
      } catch (e) {
        console.error("Error parsing stream data:", e);
      }
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
