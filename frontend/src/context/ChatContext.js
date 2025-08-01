// In frontend/src/context/ChatContext.js
import React, { createContext, useState, useContext } from 'react';
import { v4 as uuidv4 } from 'uuid'; // We need a library for unique IDs

const ChatContext = createContext(null);

export const ChatProvider = ({ children }) => {
  const [chats, setChats] = useState({}); // Stores all chats by ID
  const [activeChatId, setActiveChatId] = useState(null);

  const createNewChat = () => {
    const newChatId = uuidv4();
    setChats(prev => ({
      ...prev,
      [newChatId]: { id: newChatId, title: 'New Chat', messages: [], documents: [] }
    }));
    setActiveChatId(newChatId);
    return newChatId;
  };

  const addMessageToChat = (chatId, message) => {
    setChats(prev => ({
      ...prev,
      [chatId]: {
        ...prev[chatId],
        messages: [...prev[chatId].messages, message]
      }
    }));
  };

  const updateLastMessage = (chatId, update) => {
    setChats(prev => {
      const chat = prev[chatId];
      if (!chat || chat.messages.length === 0) return prev;

      const lastMessageIndex = chat.messages.length - 1;
      const updatedMessages = [...chat.messages];
      updatedMessages[lastMessageIndex] = {
        ...updatedMessages[lastMessageIndex],
        ...update,
      };

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
    setChats(prev => ({
        ...prev,
        [chatId]: {
            ...prev[chatId],
            documents: [...prev[chatId].documents, document]
        }
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