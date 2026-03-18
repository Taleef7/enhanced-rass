import React, { useEffect, useRef } from "react";
import { Box } from "@mui/material";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";

const MessageList = ({ messages, isTyping }) => {
  const bottomRef = useRef(null);

  useEffect(() => {
    // Use instant scroll so switching conversations doesn't animate from the top.
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
    });
  }, [messages, isTyping]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        width: "100%",
      }}
    >
      {(messages || [])
        .filter(
          (message) =>
            !(message.sender === "bot" && (!message.text || !message.text.trim()))
        )
        .map((message, index) => (
          <Box key={message.id || `${message.sender}-${index}`} sx={{ contentVisibility: "auto" }}>
            <MessageBubble message={message} index={index} />
          </Box>
        ))}

      {isTyping ? <TypingIndicator /> : null}
      <Box sx={{ height: 8 }} ref={bottomRef} />
    </Box>
  );
};

export default MessageList;
