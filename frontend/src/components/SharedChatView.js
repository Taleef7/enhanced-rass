import React, { useEffect, useState } from "react";
import {
  AppBar,
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Toolbar,
  Typography,
  Alert,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import ShareOutlinedIcon from "@mui/icons-material/ShareOutlined";

function MessageRow({ message }) {
  const theme = useTheme();
  const role = message.sender || message.role;
  const content = message.text || message.content;
  const isUser = role === "user";

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: isUser ? "row-reverse" : "row",
        gap: 1.25,
        alignItems: "flex-start",
      }}
    >
      <Avatar
        sx={{
          width: 34,
          height: 34,
          bgcolor: isUser
            ? alpha(theme.palette.secondary.main, 0.16)
            : alpha(theme.palette.primary.main, 0.16),
          color: isUser ? "secondary.light" : "primary.light",
        }}
      >
        {isUser ? (
          <PersonOutlineIcon sx={{ fontSize: 18 }} />
        ) : (
          <SmartToyOutlinedIcon sx={{ fontSize: 18 }} />
        )}
      </Avatar>

      <Paper
        sx={{
          px: 2,
          py: 1.5,
          maxWidth: "min(760px, 100%)",
          borderRadius: 4,
          bgcolor: isUser
            ? alpha(theme.palette.primary.main, 0.16)
            : alpha(theme.palette.common.white, 0.02),
          borderColor: isUser
            ? alpha(theme.palette.primary.main, 0.26)
            : "divider",
        }}
      >
        <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
          {content}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
          {message.createdAt
            ? new Date(message.createdAt).toLocaleString()
            : "Unknown time"}
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
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            response.status === 410
              ? "This share link has expired."
              : "Share link not found."
          );
        }
        return response.json();
      })
      .then(setChat)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppBar position="sticky" color="transparent">
        <Toolbar sx={{ minHeight: 68, gap: 1.5 }}>
          <Avatar
            variant="rounded"
            sx={{
              width: 38,
              height: 38,
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.16),
              color: "primary.light",
            }}
          >
            <ShareOutlinedIcon />
          </Avatar>
          <Box>
            <Typography variant="subtitle1">Shared CoRAG conversation</Typography>
            <Typography variant="body2" color="text.secondary">
              Read-only transcript with document-backed answers and context.
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, px: { xs: 2, md: 3 }, py: { xs: 2, md: 3 } }}>
        <Box sx={{ maxWidth: 1040, mx: "auto", display: "grid", gap: 2.5 }}>
          {loading ? (
            <Box sx={{ minHeight: 260, display: "grid", placeItems: "center" }}>
              <Box sx={{ display: "grid", justifyItems: "center", gap: 2 }}>
                <CircularProgress />
                <Typography variant="body2" color="text.secondary">
                  Loading shared conversation...
                </Typography>
              </Box>
            </Box>
          ) : null}

          {error ? <Alert severity="error">{error}</Alert> : null}

          {chat ? (
            <>
              <Paper sx={{ p: { xs: 2.5, md: 3 } }}>
                <Typography variant="overline" color="warning.main">
                  Shared transcript
                </Typography>
                <Typography variant="h4" sx={{ mt: 1 }}>
                  {chat.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>
                  Shared by {chat.owner}. This view is read-only and is intended
                  for review, collaboration, and citation lookup.
                </Typography>

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
                  <Chip label={`${chat.messages.length} messages`} variant="outlined" />
                  <Chip
                    label={new Date(chat.createdAt).toLocaleDateString()}
                    variant="outlined"
                  />
                </Stack>
              </Paper>

              <Stack spacing={2}>
                {chat.messages.length > 0 ? (
                  chat.messages.map((message) => (
                    <MessageRow key={message.id} message={message} />
                  ))
                ) : (
                  <Paper sx={{ p: 3 }}>
                    <Typography variant="body2" color="text.secondary" textAlign="center">
                      This conversation is empty.
                    </Typography>
                  </Paper>
                )}
              </Stack>
            </>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}

export default SharedChatView;
