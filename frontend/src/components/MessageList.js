// In frontend/src/components/MessageList.js
import React, { useRef, useEffect } from "react";
import { Box } from "@mui/material";
import { AnimatePresence } from "framer-motion";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

const MessageList = ({ messages, isTyping }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (containerRef.current) {
      // Find the main scroll container with the calc height
      let mainScrollContainer = document.querySelector(
        'div[style*="calc(100vh"]'
      );

      // Fallback to any overflow auto container
      if (!mainScrollContainer) {
        mainScrollContainer =
          document.querySelector('div[style*="overflow: auto"]') ||
          document.querySelector('*[style*="overflow:auto"]') ||
          containerRef.current.closest('[style*="overflow: auto"]');
      }

      if (mainScrollContainer) {
        // Delay to ensure content is rendered, then scroll to bottom
        setTimeout(() => {
          mainScrollContainer.scrollTo({
            top: mainScrollContainer.scrollHeight,
            behavior: "smooth",
          });
        }, 50); // Reduced delay since we have fixed height now
      }
    }
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
    </Box>
  );
};

export default MessageList;
