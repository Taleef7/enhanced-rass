// In frontend/src/components/WelcomeScreen.js
import React from "react";
import { Box, Typography } from "@mui/material";
// import { useAuth } from '../context/AuthContext';
// import { useChat } from '../context/ChatContext';

const WelcomeScreen = ({ onSuggestion }) => {
  // In a future step, we could get the user's name from useAuth()
  // const { user } = useAuth();
  // const greeting = user ? `Hello, ${user.username}` : 'Hello There';

  // Suggestions removed for a minimal welcome screen
  const sendSuggestion = () => {};

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        p: 3,
        height: "100%",
      }}
    >
      <Typography
        variant="h3"
        sx={{
          fontWeight: 700,
          mb: 1,
          background: "linear-gradient(45deg, #8ab4f8 30%, #f472b6 90%)",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        How can I help you today?
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Ask questions about your documents, brainstorm, or explore insights.
      </Typography>
    </Box>
  );
};

export default WelcomeScreen;
