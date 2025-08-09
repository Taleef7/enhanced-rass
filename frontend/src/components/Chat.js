// In frontend/src/components/Chat.js (Refactored)
import React, { useState, useRef } from "react";
import {
  Box,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Badge,
  Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import FolderIcon from "@mui/icons-material/Folder";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/Person";
import { useChat } from "../context/ChatContext";
import { useAuth } from "../context/AuthContext";
import { streamQuery } from "../apiClient"; // We'll update apiClient next
import { chatAPI } from "../api/chatApi";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import WelcomeScreen from "./WelcomeScreen";
import DocumentPanel from "./DocumentPanel";

function Chat({ onToggleSidebar, onToggleDocumentPanel }) {
  const [query, setQuery] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [isDocumentPanelOpen, setIsDocumentPanelOpen] = useState(false);
  const abortControllerRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const open = Boolean(anchorEl);

  const { activeChat, addMessageToChat, updateLastMessage } = useChat();
  const { user, logout } = useAuth();

  const handleProfileClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    handleClose();
    logout();
  };

  // Get user's initials for avatar
  const getInitials = (username) => {
    if (!username) return "U";
    return username.charAt(0).toUpperCase();
  };

  // Get document count for badge
  const documentCount = activeChat ? activeChat.documents.length : 0;

  const handleSendQuery = async (overrideText) => {
    // Normalize: if a click event bubbles here accidentally, ignore it
    const raw = overrideText ?? query;
    const qStr = typeof raw === "string" ? raw.trim() : "";
    if (!qStr || isTyping || !activeChat) return;

    // Save user message to database immediately
    addMessageToChat(activeChat.id, { sender: "user", text: qStr });
    setQuery("");
    setIsTyping(true);
    abortControllerRef.current = new AbortController();

    // Add empty bot message to local state only
    addMessageToChat(activeChat.id, { sender: "bot", text: "", sources: [] });

    let finalBotText = "";
    let finalBotSources = [];

    try {
      await streamQuery(
        qStr,
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
          await chatAPI.addMessage(
            activeChat.id,
            finalBotText,
            "bot",
            finalBotSources
          );
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
          console.warn(
            "[CHAT] Failed to save error message to database:",
            dbError
          );
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
          height: "100vh",
          width: "100vw",
          display: "flex",
          flexDirection: "column",
          bgcolor: "#0f0f0f",
          overflow: "hidden",
        }}
      >
        {/* Header - Fixed at top */}
        <Box
          sx={{
            flexShrink: 0,
            height: "60px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            px: 3,
            borderBottom: "1px solid #333",
            bgcolor: "#0f0f0f",
            // Keep header above temporary Drawer/backdrop like Gemini
            zIndex: (theme) => theme.zIndex.modal + 1,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton onClick={onToggleSidebar} sx={{ color: "#fff" }}>
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" sx={{ color: "#fff", fontWeight: 500 }}>
              Enhanced RASS
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Badge
              badgeContent={documentCount}
              color="primary"
              showZero={false}
            >
              <IconButton
                onClick={() => setIsDocumentPanelOpen(true)}
                sx={{ color: "#fff" }}
              >
                <FolderIcon />
              </IconButton>
            </Badge>
            <IconButton
              onClick={handleProfileClick}
              sx={{ color: "#fff", p: 0 }}
            >
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  backgroundColor: "primary.main",
                  fontSize: "0.875rem",
                }}
              >
                {getInitials(user?.username)}
              </Avatar>
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              open={open}
              onClose={handleClose}
              onClick={handleClose}
              PaperProps={{
                elevation: 3,
                sx: {
                  mt: 1.5,
                  minWidth: 200,
                },
              }}
            >
              <MenuItem>
                <ListItemIcon>
                  <PersonIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Profile</ListItemText>
              </MenuItem>
              <Divider />
              <MenuItem onClick={handleLogout}>
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Logout</ListItemText>
              </MenuItem>
            </Menu>
          </Box>
        </Box>

        {/* Main Content - Centered welcome screen */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Box sx={{ width: "100%", maxWidth: "768px", px: 2 }}>
            <WelcomeScreen onSuggestion={(t) => handleSendQuery(t)} />
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: "100vh",
        width: "100vw", // Full viewport width
        display: "flex",
        flexDirection: "column",
        bgcolor: "#0f0f0f", // Dark background like Gemini
        overflow: "hidden", // Prevent outer scroll
      }}
    >
      {/* Header - Fixed at top */}
      <Box
        sx={{
          flexShrink: 0,
          height: "60px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          px: 3,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          bgcolor: "rgba(15,15,15,0.85)",
          backdropFilter: "blur(10px)",
          // Ensure the top bar is always above the Drawer/backdrop
          zIndex: (theme) => theme.zIndex.modal + 1,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <IconButton onClick={onToggleSidebar} sx={{ color: "#fff" }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" sx={{ color: "#fff", fontWeight: 500 }}>
            Enhanced RASS
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Badge badgeContent={documentCount} color="primary" showZero={false}>
            <IconButton
              onClick={() => setIsDocumentPanelOpen(true)}
              sx={{ color: "#fff" }}
            >
              <FolderIcon />
            </IconButton>
          </Badge>
          <IconButton onClick={handleProfileClick} sx={{ color: "#fff", p: 0 }}>
            <Avatar
              sx={{
                width: 32,
                height: 32,
                backgroundColor: "primary.main",
                fontSize: "0.875rem",
              }}
            >
              {getInitials(user?.username)}
            </Avatar>
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={open}
            onClose={handleClose}
            onClick={handleClose}
            PaperProps={{
              elevation: 3,
              sx: {
                mt: 1.5,
                minWidth: 200,
              },
            }}
          >
            <MenuItem>
              <ListItemIcon>
                <PersonIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Profile</ListItemText>
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Logout</ListItemText>
            </MenuItem>
          </Menu>
        </Box>
      </Box>

      {/* Main Content Area - full height minus header; extra bottom padding so input never covers content */}
      <Box
        sx={{
          height: "calc(100vh - 60px)",
          width: "100%",
          overflow: "auto", // Main scrollbar will be at the edge
          display: "flex",
          justifyContent: "center", // Center the content
          pb: 0, // spacer inside MessageList handles clearance; keep scrollable height accurate
          // Custom scrollbar styling for professional look
          "&::-webkit-scrollbar": {
            width: "8px",
          },
          "&::-webkit-scrollbar-track": {
            background: "transparent",
          },
          "&::-webkit-scrollbar-thumb": {
            background: "#333",
            borderRadius: "4px",
          },
          "&::-webkit-scrollbar-thumb:hover": {
            background: "#555",
          },
        }}
        ref={scrollContainerRef}
      >
        {/* Centered content container */}
        <Box
          sx={{
            width: "100%",
            maxWidth: "768px", // Gemini-like max width
            display: "flex",
            flexDirection: "column",
            px: 2,
          }}
        >
          {/* Messages content */}
          <Box sx={{ py: 3 }}>
            {activeChat.messages.length === 0 && !isTyping ? (
              <WelcomeScreen onSuggestion={(t) => handleSendQuery(t)} />
            ) : (
              <MessageList
                messages={activeChat.messages}
                isTyping={isTyping}
                scrollContainerRef={scrollContainerRef}
              />
            )}
          </Box>
        </Box>
      </Box>

      {/* Chat input - Fixed at bottom; no full-width background so content behind stays visible */}
      <Box
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          background: "transparent",
          backdropFilter: "none",
          boxShadow: "none",
          py: 0.5, // keep compact so it sits slightly lower without covering content
          px: 2,
          zIndex: (theme) => theme.zIndex.modal + 1,
        }}
      >
        <Box sx={{ width: "100%", maxWidth: "768px" }}>
          <ChatInput
            query={query}
            setQuery={setQuery}
            onSend={handleSendQuery}
            onStop={() => {
              try {
                abortControllerRef.current?.abort();
              } catch {}
              setIsTyping(false);
            }}
            showSuggestions={activeChat?.messages?.length === 0}
            isTyping={isTyping}
          />
        </Box>
      </Box>

      {/* Document Panel Modal */}
      <DocumentPanel
        open={isDocumentPanelOpen}
        onClose={() => setIsDocumentPanelOpen(false)}
      />
    </Box>
  );
}

export default Chat;
