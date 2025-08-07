// In frontend/src/context/ChatContext.js
import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
} from "react";
import { v4 as uuidv4 } from "uuid"; // We need a library for unique IDs
import { useAuth } from "./AuthContext";
import { chatAPI } from "../api/chatApi";

const ChatContext = createContext(null);

export const ChatProvider = ({ children }) => {
  const { token, user } = useAuth(); // Get the current user's token and user info
  const [chats, setChats] = useState({}); // Stores all chats by ID
  const [activeChatId, setActiveChatId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isServerAvailable, setIsServerAvailable] = useState(true);

  // Convert server chat format to local format
  const convertServerChatToLocal = (serverChat) => {
    const messages = (serverChat.messages || []).map(message => {
      // Parse sources if they're stored as JSON string
      let parsedSources = message.sources;
      if (typeof message.sources === 'string') {
        try {
          parsedSources = JSON.parse(message.sources);
        } catch (e) {
          console.warn('Failed to parse message sources:', e);
          parsedSources = [];
        }
      }
      
      return {
        ...message,
        sources: Array.isArray(parsedSources) ? parsedSources : []
      };
    });

    return {
      id: serverChat.id,
      title: serverChat.title,
      messages: messages,
      documents: serverChat.documents || [], // Use server documents
      updatedAt: serverChat.updatedAt,
      createdAt: serverChat.createdAt,
    };
  };

  // Load chats from server or localStorage fallback
  const loadChats = useCallback(async () => {
    if (!user?.userId || !token) {
      console.log("[CHAT CONTEXT] Cannot load chats - no user or token:", { userId: user?.userId, hasToken: !!token });
      return;
    }

    console.log("[CHAT CONTEXT] Starting loadChats for user:", user.userId);
    setIsLoading(true);
    try {
      // Try to load from server first
      if (isServerAvailable) {
        console.log("[CHAT CONTEXT] Loading chats from server...");
        const serverChats = await chatAPI.fetchChats();
        console.log("[CHAT CONTEXT] Server chats loaded:", serverChats);
        const localChats = {};

        serverChats.forEach((chat) => {
          localChats[chat.id] = convertServerChatToLocal(chat);
        });

        console.log("[CHAT CONTEXT] Converted chats:", localChats);
        setChats(localChats);

        // Set active chat if we have chats and no active chat is set
        const chatIds = Object.keys(localChats);
        if (chatIds.length > 0 && !activeChatId) {
          console.log("[CHAT CONTEXT] Setting active chat to:", chatIds[0]);
          setActiveChatId(chatIds[0]);
        }

        setIsServerAvailable(true);
      } else {
        throw new Error("Server not available, using localStorage");
      }
    } catch (error) {
      console.warn(
        "[CHAT CONTEXT] Failed to load chats from server, falling back to localStorage:",
        error
      );
      setIsServerAvailable(false);

      // Fallback to localStorage
      const savedChats = localStorage.getItem(`chats_${user.userId}`);
      const savedActiveChatId = localStorage.getItem(`activeChatId_${user.userId}`);
      console.log("[CHAT CONTEXT] localStorage backup:", { savedChats: !!savedChats, savedActiveChatId });

      if (savedChats) {
        const parsedChats = JSON.parse(savedChats);
        setChats(parsedChats);

        if (savedActiveChatId && parsedChats[savedActiveChatId]) {
          setActiveChatId(savedActiveChatId);
        } else if (Object.keys(parsedChats).length > 0) {
          setActiveChatId(Object.keys(parsedChats)[0]);
        }
      }
    }
    setIsLoading(false);
  }, [user?.userId, token]); // Remove isServerAvailable from deps to prevent infinite loop

  // Load chats when user changes or on mount
  useEffect(() => {
    console.log("[CHAT CONTEXT] useEffect triggered - calling loadChats", { 
      userId: user?.userId, 
      hasToken: !!token,
      hasActiveChatId: !!activeChatId
    });
    loadChats();
  }, [user?.userId, token]); // Remove loadChats from deps to prevent infinite loop

  // Save chats to localStorage as backup whenever chats change
  useEffect(() => {
    if (user?.userId && Object.keys(chats).length > 0) {
      localStorage.setItem(`chats_${user.userId}`, JSON.stringify(chats));
    }
  }, [chats, user?.userId]);

  // Save active chat ID to localStorage whenever it changes
  useEffect(() => {
    if (user?.userId && activeChatId) {
      localStorage.setItem(`activeChatId_${user.userId}`, activeChatId);
    }
  }, [activeChatId, user?.userId]);

  const createNewChat = async (title = "New Chat") => {
    try {
      if (isServerAvailable) {
        const serverChat = await chatAPI.createChat(title);
        const localChat = convertServerChatToLocal(serverChat);

        setChats((prev) => ({
          ...prev,
          [localChat.id]: localChat,
        }));
        setActiveChatId(localChat.id);
        return localChat.id;
      } else {
        throw new Error("Server not available");
      }
    } catch (error) {
      console.warn("Failed to create chat on server, creating locally:", error);
      setIsServerAvailable(false);

      // Fallback to local creation
      const newChatId = uuidv4();
      const newChat = {
        id: newChatId,
        title,
        messages: [],
        documents: [],
      };

      setChats((prev) => ({
        ...prev,
        [newChatId]: newChat,
      }));
      setActiveChatId(newChatId);
      return newChatId;
    }
  };

  const updateChatTitle = async (chatId, title) => {
    try {
      if (isServerAvailable) {
        await chatAPI.updateChat(chatId, title);
      }
    } catch (error) {
      console.warn("Failed to update chat title on server:", error);
      setIsServerAvailable(false);
    }

    // Update locally regardless of server success
    setChats((prev) => ({
      ...prev,
      [chatId]: {
        ...prev[chatId],
        title: title,
      },
    }));
  };

  const deleteChat = async (chatId) => {
    try {
      if (isServerAvailable) {
        await chatAPI.deleteChat(chatId);
      }
    } catch (error) {
      console.warn("Failed to delete chat on server:", error);
      setIsServerAvailable(false);
    }

    // Delete locally regardless of server success
    setChats((prev) => {
      const newChats = { ...prev };
      delete newChats[chatId];
      return newChats;
    });

    // If we're deleting the active chat, switch to another one or create new
    if (chatId === activeChatId) {
      const remainingChatIds = Object.keys(chats).filter((id) => id !== chatId);
      if (remainingChatIds.length > 0) {
        setActiveChatId(remainingChatIds[0]);
      } else {
        setActiveChatId(null);
      }
    }
  };

  const clearAllChats = () => {
    if (user?.userId) {
      localStorage.removeItem(`chats_${user.userId}`);
      localStorage.removeItem(`activeChatId_${user.userId}`);
    }
    setChats({});
    setActiveChatId(null);
  };

  const addMessageToChat = async (chatId, message) => {
    // Update local state immediately for responsiveness
    setChats((prev) => {
      const updatedChats = {
        ...prev,
        [chatId]: {
          ...prev[chatId],
          messages: [...prev[chatId].messages, message],
        },
      };

      // Auto-generate title from first user message
      if (message.sender === "user" && prev[chatId].messages.length === 0) {
        const title =
          message.text.length > 50
            ? message.text.substring(0, 50) + "..."
            : message.text;
        updatedChats[chatId].title = title;
      }

      return updatedChats;
    });

    // Try to sync with server in the background
    try {
      if (isServerAvailable) {
        await chatAPI.addMessage(
          chatId,
          message.text,
          message.sender,
          message.sources
        );

        // If this is a user message that generated a title, update the title on server
        if (message.sender === "user" && chats[chatId]?.messages.length === 0) {
          const title =
            message.text.length > 50
              ? message.text.substring(0, 50) + "..."
              : message.text;
          await chatAPI.updateChat(chatId, title);
        }
      }
    } catch (error) {
      console.warn("Failed to sync message with server:", error);
      setIsServerAvailable(false);
    }
  };

  const updateLastMessage = (chatId, update) => {
    setChats((prev) => {
      const chat = prev[chatId];
      if (!chat || chat.messages.length === 0) return prev;

      const lastMessageIndex = chat.messages.length - 1;
      const updatedMessages = [...chat.messages];
      const currentLastMessage = updatedMessages[lastMessageIndex];

      // If the update contains a text chunk, append it. Otherwise, merge the update.
      if (update.textChunk) {
        updatedMessages[lastMessageIndex] = {
          ...currentLastMessage,
          text: (currentLastMessage.text || "") + update.textChunk,
        };
      } else {
        updatedMessages[lastMessageIndex] = {
          ...currentLastMessage,
          ...update,
        };
      }

      return {
        ...prev,
        [chatId]: {
          ...chat,
          messages: updatedMessages,
        },
      };
    });
  };

  const addDocumentToChat = (chatId, document) => {
    setChats((prev) => ({
      ...prev,
      [chatId]: {
        ...prev[chatId],
        documents: [...prev[chatId].documents, document],
      },
    }));
  };

  const activeChat = activeChatId ? chats[activeChatId] : null;

  const chatContextValue = {
    chats,
    activeChatId,
    isLoading,
    isServerAvailable,
    setActiveChatId,
    setChats,
    createNewChat,
    addMessageToChat,
    addDocumentToChat,
    activeChat,
    updateLastMessage,
    updateChatTitle,
    deleteChat,
    clearAllChats,
    loadChats, // Expose for manual refresh
  };

  return (
    <ChatContext.Provider value={chatContextValue}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  return useContext(ChatContext);
};
