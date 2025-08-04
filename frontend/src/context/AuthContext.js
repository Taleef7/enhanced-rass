// In frontend/src/context/AuthContext.js
import React, { createContext, useState, useContext, useEffect } from "react";

const AuthContext = createContext(null);

// Helper function to decode JWT token
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
  const [token, setToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check for a token in local storage when the app first loads
    const storedToken = localStorage.getItem("authToken");
    if (storedToken) {
      const decodedUser = decodeToken(storedToken);
      if (decodedUser) {
        setToken(storedToken);
        setUser(decodedUser);
        setIsAuthenticated(true);
      } else {
        // Token is invalid, remove it
        localStorage.removeItem("authToken");
      }
    }
  }, []);

  const login = (newToken) => {
    const decodedUser = decodeToken(newToken);
    if (decodedUser) {
      localStorage.setItem("authToken", newToken);
      setToken(newToken);
      setUser(decodedUser);
      setIsAuthenticated(true);
    } else {
      throw new Error("Invalid token received");
    }
  };

  const logout = () => {
    localStorage.removeItem("authToken");
    // Clear all user-specific chat data
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
