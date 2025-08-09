// In frontend/src/components/WelcomeScreen.js
import React from "react";
import { Box, Typography, Avatar, Chip, Stack, Paper } from "@mui/material";
import PsychologyIcon from "@mui/icons-material/Psychology";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import InsightsIcon from "@mui/icons-material/Insights";
import ArticleIcon from "@mui/icons-material/Article";
import MicIcon from "@mui/icons-material/Mic";
import UploadFileIcon from "@mui/icons-material/UploadFile";
// import { useAuth } from '../context/AuthContext';
// import { useChat } from '../context/ChatContext';

const WelcomeScreen = ({ onSuggestion }) => {
  // In a future step, we could get the user's name from useAuth()
  // const { user } = useAuth();
  // const greeting = user ? `Hello, ${user.username}` : 'Hello There';

  const sendSuggestion = (text) => {
    if (onSuggestion) onSuggestion(text);
  };

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
      <Avatar
        sx={{ width: 72, height: 72, mb: 3, bgcolor: "background.paper" }}
      >
        <PsychologyIcon sx={{ fontSize: 48, color: "primary.main" }} />
      </Avatar>

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

      <Stack
        direction="row"
        spacing={1}
        sx={{ mb: 4, flexWrap: "wrap", justifyContent: "center" }}
      >
        <Chip
          icon={<UploadFileIcon />}
          label="Upload PDFs, DOCX, or Markdown"
          variant="outlined"
        />
        <Chip
          icon={<MicIcon />}
          label="Use voice input to speak your question"
          variant="outlined"
        />
        <Chip
          icon={<InsightsIcon />}
          label="Get citations from your sources"
          variant="outlined"
        />
        <Chip
          icon={<AutoAwesomeIcon />}
          label="Streamed, fast responses"
          variant="outlined"
        />
      </Stack>

      <Stack spacing={2} sx={{ width: "100%", maxWidth: 680 }}>
        {[
          "Summarize the key points from my uploaded PDFs",
          "Draft an email using the information in my documents",
          "What are the main themes in War of the Worlds?",
          "Create a study guide from my notes",
        ].map((s, i) => (
          <Paper
            key={i}
            onClick={() => sendSuggestion(s)}
            sx={{
              p: 2,
              cursor: "pointer",
              backgroundColor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
              "&:hover": {
                borderColor: "primary.main",
                boxShadow: "0 8px 24px rgba(138,180,248,0.12)",
              },
            }}
          >
            <Typography variant="body1" sx={{ textAlign: "left" }}>
              <ArticleIcon
                sx={{ mr: 1, verticalAlign: "middle", color: "primary.main" }}
              />
              {s}
            </Typography>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
};

export default WelcomeScreen;
