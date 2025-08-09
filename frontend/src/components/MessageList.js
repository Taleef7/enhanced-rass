// In frontend/src/components/MessageList.js
import React, { useRef, useEffect } from "react";
import { Box } from "@mui/material";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

const MessageList = ({ messages, isTyping, scrollContainerRef }) => {
  const containerRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    // Scroll the sentinel into view to guarantee the latest content is visible
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, [messages, isTyping]);
  return (
    <Box
      ref={containerRef}
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 4, // Reduced gap for cleaner Gemini-like spacing
        py: 2,
        // Remove any internal scrolling - let the parent handle it
        overflow: "visible",
        width: "100%",
      }}
    >
      {messages.map((message, index) => (
        <MessageBubble key={index} message={message} />
      ))}
      {isTyping && <TypingIndicator />}
      {/* Spacer so the last message clears the fixed input bar */}
      <Box sx={{ height: 140 }} />
      <div ref={bottomRef} />
    </Box>
  );
};

export default MessageList;
