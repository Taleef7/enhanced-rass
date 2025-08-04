// In frontend/src/components/MessageList.js
import React, { useRef, useEffect } from "react";
import { Box } from "@mui/material";
import { AnimatePresence } from "framer-motion";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

const MessageList = ({ messages, isTyping }) => {
  const chatBoxRef = useRef(null);

  // Effect to auto-scroll to the bottom on new messages
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  return (
    <Box
      ref={chatBoxRef}
      sx={{
        flex: 1,
        overflowY: "auto",
        p: 2,
        display: "flex",
        flexDirection: "column",
        minHeight: 0, // This is crucial for flex scrolling
      }}
    >
      <AnimatePresence>
        {messages.map((message, index) => (
          <MessageBubble key={index} message={message} index={index} />
        ))}
      </AnimatePresence>
      {isTyping && <TypingIndicator />}
    </Box>
  );
};

export default MessageList;
