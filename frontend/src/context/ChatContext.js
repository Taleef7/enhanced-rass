// In frontend/src/context/ChatContext.js
import React, { createContext, useState, useContext, useEffect } from "react";
import { v4 as uuidv4 } from "uuid"; // We need a library for unique IDs
import { useAuth } from "./AuthContext";

const ChatContext = createContext(null);

export const ChatProvider = ({ children }) => {
  const { token, user } = useAuth(); // Get the current user's token and user info
  const [chats, setChats] = useState({}); // Stores all chats by ID
  const [activeChatId, setActiveChatId] = useState(null);

  // Load chats from localStorage on mount or when user changes
  useEffect(() => {
    if (user?.id) {
      const savedChats = localStorage.getItem(`chats_${user.id}`);
      const savedActiveChatId = localStorage.getItem(`activeChatId_${user.id}`);

      if (savedChats) {
        const parsedChats = JSON.parse(savedChats);
        setChats(parsedChats);

        if (savedActiveChatId && parsedChats[savedActiveChatId]) {
          setActiveChatId(savedActiveChatId);
        } else if (Object.keys(parsedChats).length > 0) {
          // Set the first chat as active if saved active chat doesn't exist
          setActiveChatId(Object.keys(parsedChats)[0]);
        }
      }
    }
  }, [user?.id]);

  // Save chats to localStorage whenever chats change
  useEffect(() => {
    if (user?.id && Object.keys(chats).length > 0) {
      localStorage.setItem(`chats_${user.id}`, JSON.stringify(chats));
    }
  }, [chats, user?.id]);

  // Save active chat ID to localStorage whenever it changes
  useEffect(() => {
    if (user?.id && activeChatId) {
      localStorage.setItem(`activeChatId_${user.id}`, activeChatId);
    }
  }, [activeChatId, user?.id]);

  const createNewChat = () => {
    const newChatId = uuidv4();
    const newChat = {
      id: newChatId,
      title: "New Chat",
      messages: [],
      documents: [],
    };

    setChats((prev) => ({
      ...prev,
      [newChatId]: newChat,
    }));
    setActiveChatId(newChatId);
    return newChatId;
  };

  const updateChatTitle = (chatId, title) => {
    setChats((prev) => ({
      ...prev,
      [chatId]: {
        ...prev[chatId],
        title: title,
      },
    }));
  };

  const deleteChat = (chatId) => {
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
    if (user?.id) {
      localStorage.removeItem(`chats_${user.id}`);
      localStorage.removeItem(`activeChatId_${user.id}`);
    }
    setChats({});
    setActiveChatId(null);
  };

  const addMessageToChat = (chatId, message) => {
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
    setActiveChatId,
    createNewChat,
    addMessageToChat,
    addDocumentToChat,
    activeChat,
    updateLastMessage,
    updateChatTitle,
    deleteChat,
    clearAllChats,
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
