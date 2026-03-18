// In frontend/src/context/AuthContext.js
// Phase D: JWT is now stored in memory (React state) instead of localStorage to
// reduce XSS exposure. The HTTP-only refresh token cookie (set by the server) is
// used to silently restore sessions on page reload via POST /api/auth/refresh.

import React, { createContext, useState, useContext, useEffect, useRef } from "react";
import axios from "axios";
import { API_BASE_URL } from "../apiClient";

const AuthContext = createContext(null);

// Use the same base URL as the rest of the app (env-driven, not hardcoded)
const API_BASE = API_BASE_URL;

// Named constants for refresh scheduling
const REFRESH_BUFFER_MS = 60 * 1000;  // Refresh 1 minute before JWT expiry
const MIN_REFRESH_DELAY_MS = 5000;    // Minimum delay to avoid tight loops

// Helper function to decode JWT token (no verification — server already did that)
const decodeToken = (token) => {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map(function (c) {
          return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("Error decoding token:", error);
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  // Token lives ONLY in memory — not persisted to localStorage (Phase D security)
  const [token, setToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef(null);

  /**
   * Schedule a silent token refresh 1 minute before the JWT expires.
   */
  const scheduleRefresh = (jwtToken) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const decoded = decodeToken(jwtToken);
    if (!decoded?.exp) return;
    const msUntilExpiry = decoded.exp * 1000 - Date.now();
    const refreshIn = Math.max(msUntilExpiry - REFRESH_BUFFER_MS, MIN_REFRESH_DELAY_MS);
    refreshTimerRef.current = setTimeout(() => silentRefresh(), refreshIn);
  };

  /**
   * Attempt a silent token refresh using the HTTP-only cookie.
   *
   * Only clears the session on explicit auth failures (401 / 403).
   * Network errors and server errors (5xx) are transient — we leave the
   * existing session intact so a temporarily unavailable backend does not
   * log the user out unexpectedly.
   */
  const silentRefresh = async () => {
    try {
      const resp = await axios.post(
        `${API_BASE}/auth/refresh`,
        {},
        { withCredentials: true }
      );
      const newToken = resp.data?.token;
      if (newToken) {
        const decodedUser = decodeToken(newToken);
        setToken(newToken);
        setUser(decodedUser);
        setIsAuthenticated(true);
        scheduleRefresh(newToken);
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        // Refresh token is genuinely expired or invalid — log out.
        setToken(null);
        setUser(null);
        setIsAuthenticated(false);
      }
      // For network errors (no response) or 5xx server errors: transient failure.
      // Do not log the user out — the session cookie is still valid; it will work
      // once the backend recovers. isLoading is still set to false by the caller.
    }
  };

  // On mount: attempt a silent refresh to restore session from the HTTP-only cookie
  useEffect(() => {
    silentRefresh().finally(() => setIsLoading(false));
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = (newToken) => {
    const decodedUser = decodeToken(newToken);
    if (decodedUser) {
      // Do NOT persist to localStorage — keep in memory only
      setToken(newToken);
      setUser(decodedUser);
      setIsAuthenticated(true);
      scheduleRefresh(newToken);
    } else {
      throw new Error("Invalid token received");
    }
  };

  const logout = async () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    try {
      await axios.post(
        `${API_BASE}/auth/logout`,
        {},
        {
          withCredentials: true,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
    } catch (_) {
      // Best-effort logout
    }
    // Clean up any legacy localStorage tokens from previous versions
    localStorage.removeItem("authToken");
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith("chats_") || key.startsWith("activeChatId_")) {
        localStorage.removeItem(key);
      }
    });
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
  };

  const authContextValue = {
    token,
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to easily use the auth context in any component
export const useAuth = () => {
  return useContext(AuthContext);
};
