// frontend/src/components/SharedChatView.js
// Phase G #138: Public read-only view of a shared chat session.
// Accessed via /shared/:token (no auth required).

import React, { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  Avatar,
  Divider,
  AppBar,
  Toolbar,
} from "@mui/material";
import { SmartToy as BotIcon, Person as PersonIcon } from "@mui/icons-material";

function MessageRow({ msg }) {
  const isUser = msg.role === "user";
  return (
    <Box
      sx={{
        display: "flex",
        gap: 1.5,
        mb: 2,
        flexDirection: isUser ? "row-reverse" : "row",
        alignItems: "flex-start",
      }}
    >
      <Avatar
        sx={{
          width: 32,
          height: 32,
          bgcolor: isUser ? "secondary.main" : "primary.main",
          flexShrink: 0,
        }}
      >
        {isUser ? <PersonIcon sx={{ fontSize: 18 }} /> : <BotIcon sx={{ fontSize: 18 }} />}
      </Avatar>
      <Paper
        elevation={1}
        sx={{
          p: 2,
          maxWidth: "80%",
          borderRadius: 2,
          bgcolor: isUser ? "primary.dark" : "background.paper",
          color: isUser ? "primary.contrastText" : "text.primary",
        }}
      >
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
          {msg.content}
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.6, display: "block", mt: 0.5 }}>
          {new Date(msg.createdAt).toLocaleTimeString()}
        </Typography>
      </Paper>
    </Box>
  );
}

function SharedChatView({ token }) {
  const [chat, setChat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/shared/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 410 ? "This share link has expired." : "Share link not found.");
        return res.json();
      })
      .then(setChat)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#0f0f23", display: "flex", flexDirection: "column" }}>
      <AppBar position="static" elevation={0} sx={{ bgcolor: "background.paper", borderBottom: 1, borderColor: "divider" }}>
        <Toolbar>
          <Typography variant="h6" sx={{ fontWeight: 700, color: "primary.main" }}>
            ⚡ RASS
          </Typography>
          <Typography variant="body2" sx={{ ml: 2, color: "text.secondary" }}>
            Shared Conversation
          </Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, maxWidth: 900, mx: "auto", width: "100%", p: 3 }}>
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 4 }}>
            {error}
          </Alert>
        )}

        {chat && (
          <>
            <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
              <Typography variant="h5" fontWeight={700} gutterBottom>
                {chat.title}
              </Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Chip label={`Shared by ${chat.owner}`} size="small" variant="outlined" />
                <Chip
                  label={`${chat.messages.length} messages`}
                  size="small"
                  variant="outlined"
                />
                <Chip
                  label={new Date(chat.createdAt).toLocaleDateString()}
                  size="small"
                  variant="outlined"
                />
              </Box>
            </Paper>

            <Divider sx={{ mb: 3 }} />

            <Box>
              {chat.messages.map((msg) => (
                <MessageRow key={msg.id} msg={msg} />
              ))}
            </Box>

            {chat.messages.length === 0 && (
              <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 4 }}>
                This conversation is empty.
              </Typography>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}

export default SharedChatView;
