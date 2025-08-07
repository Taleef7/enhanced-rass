// frontend/src/api/chatApi.js
import { API_BASE_URL } from "../apiClient";

class ChatAPI {
  constructor() {
    this.baseURL = `${API_BASE_URL}/chats`;
  }

  getAuthHeaders() {
    const token = localStorage.getItem("authToken");
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  async fetchChats() {
    try {
      const response = await fetch(this.baseURL, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching chats:", error);
      throw error;
    }
  }

  async fetchChat(chatId) {
    try {
      const response = await fetch(`${this.baseURL}/${chatId}`, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching chat:", error);
      throw error;
    }
  }

  async createChat(title = "New Chat") {
    try {
      const response = await fetch(this.baseURL, {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ title }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error creating chat:", error);
      throw error;
    }
  }

  async updateChat(chatId, title) {
    try {
      const response = await fetch(`${this.baseURL}/${chatId}`, {
        method: "PATCH",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ title }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error updating chat:", error);
      throw error;
    }
  }

  async deleteChat(chatId) {
    try {
      const response = await fetch(`${this.baseURL}/${chatId}`, {
        method: "DELETE",
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error("Error deleting chat:", error);
      throw error;
    }
  }

  async addMessage(chatId, text, sender, sources = []) {
    try {
      const response = await fetch(`${this.baseURL}/${chatId}/messages`, {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ text, sender, sources }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error adding message:", error);
      throw error;
    }
  }

  async updateMessage(chatId, messageId, text, sources) {
    try {
      const response = await fetch(
        `${this.baseURL}/${chatId}/messages/${messageId}`,
        {
          method: "PATCH",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({ text, sources }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error updating message:", error);
      throw error;
    }
  }

  async deleteMessage(chatId, messageId) {
    try {
      const response = await fetch(
        `${this.baseURL}/${chatId}/messages/${messageId}`,
        {
          method: "DELETE",
          headers: this.getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error("Error deleting message:", error);
      throw error;
    }
  }

  // Get all documents uploaded by the user (across all chats)
  async getUserDocuments() {
    try {
      const response = await fetch(`${API_BASE_URL}/user-documents`, {
        method: "GET",
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.documents || [];
    } catch (error) {
      console.error("Error fetching user documents:", error);
      throw error;
    }
  }

  // Clean up polluted chat documents
  async cleanupChatDocuments(chatId) {
    try {
      const response = await fetch(`${this.baseURL}/${chatId}/documents/cleanup`, {
        method: "DELETE",
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error cleaning up chat documents:", error);
      throw error;
    }
  }
}

export const chatAPI = new ChatAPI();
