// In frontend/src/components/Chat.js (Refactored)
import React, { useState, useRef, useEffect } from "react";
import { Box, Typography, Tooltip, IconButton } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useChat } from "../context/ChatContext";
import { streamQuery } from "../apiClient"; // We'll update apiClient next
import { chatAPI } from "../api/chatApi";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import WelcomeScreen from "./WelcomeScreen";

function Chat() {
  const [query, setQuery] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const abortControllerRef = useRef(null);

  const { activeChat, addMessageToChat, createNewChat, updateLastMessage, setChats } =
    useChat();

  const handleSendQuery = async () => {
    if (!query.trim() || isTyping || !activeChat) return;

    // Save user message to database immediately
    addMessageToChat(activeChat.id, { sender: "user", text: query.trim() });
    setQuery("");
    setIsTyping(true);
    abortControllerRef.current = new AbortController();
    
    // Add empty bot message to local state only
    setChats(prev => ({
      ...prev,
      [activeChat.id]: {
        ...prev[activeChat.id],
        messages: [...prev[activeChat.id].messages, { sender: "bot", text: "", sources: [] }]
      }
    }));

    let finalBotText = "";
    let finalBotSources = [];

    try {
      await streamQuery(
        query.trim(),
        activeChat.documents,
        (textChunk) => {
          // onTextChunk - update local state and accumulate final text
          updateLastMessage(activeChat.id, { textChunk: textChunk });
          finalBotText += textChunk;
        },
        (sources) => {
          // onSources - update local state and store final sources
          updateLastMessage(activeChat.id, { sources });
          finalBotSources = sources;
        },
        abortControllerRef.current.signal
      );
      
      // After streaming completes, save the complete bot message to database
      if (finalBotText || finalBotSources.length > 0) {
        try {
          await chatAPI.addMessage(activeChat.id, finalBotText, "bot", finalBotSources);
          console.log("[CHAT] Successfully saved bot message to database");
        } catch (error) {
          console.warn("[CHAT] Failed to save bot message to database:", error);
        }
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Streaming error:", error);
        const errorMessage = `Error: ${error.message}`;
        updateLastMessage(activeChat.id, { text: errorMessage });
        // Save error message to database
        try {
          await chatAPI.addMessage(activeChat.id, errorMessage, "bot", []);
        } catch (dbError) {
          console.warn("[CHAT] Failed to save error message to database:", dbError);
        }
      }
    } finally {
      setIsTyping(false);
    }
  };

  // 4. If there's no active chat yet, show a welcome screen
  if (!activeChat) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <WelcomeScreen />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "background.default",
      }}
    >
      <Box
        sx={{
          p: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          backgroundColor: "background.paper",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {activeChat.title}
        </Typography>
        <Tooltip title="Clear chat (Not implemented)">
          <IconButton size="small" disabled>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {activeChat.messages.length === 0 && !isTyping ? (
        <WelcomeScreen />
      ) : (
        <MessageList messages={activeChat.messages} isTyping={isTyping} />
      )}

      <ChatInput
        query={query}
        setQuery={setQuery}
        onSend={handleSendQuery}
        isTyping={isTyping}
      />
    </Box>
  );
}

export default Chat;
