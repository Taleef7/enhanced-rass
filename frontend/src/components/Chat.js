import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import FolderSpecialOutlinedIcon from "@mui/icons-material/FolderSpecialOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import { useChat } from "../context/ChatContext";
import { useAuth } from "../context/AuthContext";
import { fetchDocuments, streamQuery } from "../apiClient";
import { chatAPI } from "../api/chatApi";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import WelcomeScreen from "./WelcomeScreen";
import DocumentPanel from "./DocumentPanel";
import GuidedTour from "./GuidedTour";

const TOP_K_OPTIONS = [3, 5, 10, 20];
const TOP_K_STORAGE_KEY = "corag_top_k";

function loadTopK() {
  try {
    const saved = localStorage.getItem(TOP_K_STORAGE_KEY);
    const parsed = parseInt(saved, 10);
    return TOP_K_OPTIONS.includes(parsed) ? parsed : 10;
  } catch {
    return 10;
  }
}

function Chat({ onToggleSidebar }) {
  useTheme(); // keep theme context active for child components
  const [query, setQuery] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [topK, setTopK] = useState(loadTopK);
  const [anchorEl, setAnchorEl] = useState(null);
  const [isDocumentPanelOpen, setIsDocumentPanelOpen] = useState(false);
  const [runTour, setRunTour] = useState(false);
  const [libraryDocuments, setLibraryDocuments] = useState([]);
  const abortControllerRef = useRef(null);
  const scrollContainerRef = useRef(null);

  const { activeChat, addMessageToChat, updateLastMessage, setChats, activeKbId } = useChat();
  const { user, logout, token } = useAuth();
  const menuOpen = Boolean(anchorEl);
  const documentCount = libraryDocuments.length;
  const messageCount = activeChat?.messages?.length || 0;
  const activeDocuments = useMemo(
    () => activeChat?.documents || [],
    [activeChat?.documents]
  );
  const readyDocuments = libraryDocuments.filter(
    (document) => document.status === "READY"
  ).length;
  const documentRefreshKey = useMemo(
    () =>
      activeDocuments
        .map((document) => `${document.name || document.originalFilename}:${document.status}`)
        .join("|"),
    [activeDocuments]
  );

  const workspaceSummary = useMemo(() => {
    if (!activeChat) {
      return {
        label: "No conversation selected",
        helper: "Create a new conversation to begin.",
      };
    }

    return {
      label: activeChat.title || "Untitled conversation",
      helper:
        messageCount > 0
          ? `${messageCount} message${messageCount === 1 ? "" : "s"}`
          : "Ask a question or upload a document to begin.",
    };
  }, [activeChat, messageCount]);

  const handleSendQuery = async (overrideText) => {
    const raw = overrideText ?? query;
    const normalizedQuery = typeof raw === "string" ? raw.trim() : "";

    if (!normalizedQuery || isTyping || !activeChat) return;

    addMessageToChat(activeChat.id, { sender: "user", text: normalizedQuery });
    setQuery("");
    setIsTyping(true);
    abortControllerRef.current = new AbortController();

    addMessageToChat(activeChat.id, {
      sender: "bot",
      text: "",
      sources: [],
      localOnly: true,
    });

    let finalBotText = "";
    let finalBotSources = [];

    try {
      await streamQuery(
        normalizedQuery,
        activeChat.documents,
        (textChunk) => {
          updateLastMessage(activeChat.id, { textChunk });
          finalBotText += textChunk;
        },
        (sources) => {
          updateLastMessage(activeChat.id, { sources });
          finalBotSources = sources;
        },
        abortControllerRef.current.signal,
        token,
        null, // onContext — context panel removed (Phase 8.1)
        null, // onReconnecting
        activeKbId,
        topK
      );

      if (finalBotText || finalBotSources.length > 0) {
        try {
          await chatAPI.addMessage(
            activeChat.id,
            finalBotText,
            "bot",
            finalBotSources
          );
        } catch (error) {
          console.warn("[CHAT] Failed to save bot message:", error);
        }
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        const errorMessage = `Error: ${error.message}`;
        updateLastMessage(activeChat.id, { text: errorMessage });

        try {
          await chatAPI.addMessage(activeChat.id, errorMessage, "bot", []);
        } catch (dbError) {
          console.warn("[CHAT] Failed to save error message:", dbError);
        }
      }
    } finally {
      setIsTyping(false);
    }
  };

  useEffect(() => {
    if (!token) return undefined;

    let disposed = false;

    const loadDocumentLibrary = async () => {
      try {
        const response = await fetchDocuments(1, 100, null, token);
        if (!disposed) {
          setLibraryDocuments(response.data.documents || []);
        }
      } catch (error) {
        console.warn("[CHAT] Failed to load document library:", error);
      }
    };

    loadDocumentLibrary();
    const intervalId = window.setInterval(loadDocumentLibrary, 15000);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [token]);

  useEffect(() => {
    if (!activeChat?.id || !token || activeDocuments.length === 0) return undefined;

    const hasPendingDocuments = activeDocuments.some((document) =>
      ["QUEUED", "PROCESSING"].includes(document.status)
    );

    if (!hasPendingDocuments) return undefined;

    let disposed = false;

    const syncDocumentStatuses = async () => {
      try {
        const response = await fetchDocuments(1, 100, null, token);
        const documents = response.data.documents || [];
        const byName = new Map(
          documents.map((document) => [
            document.originalFilename || document.name,
            document,
          ])
        );

        if (disposed) return;

        setChats((previous) => {
          const chat = previous[activeChat.id];
          if (!chat) return previous;

          let changed = false;
          const nextDocuments = chat.documents.map((document) => {
            const key = document.originalFilename || document.name;
            const match = byName.get(key);

            if (!match) return document;

            const nextStatus = match.status || document.status;
            const nextChunkCount =
              typeof match.chunkCount === "number"
                ? match.chunkCount
                : document.chunkCount;

            if (
              nextStatus === document.status &&
              nextChunkCount === document.chunkCount
            ) {
              return document;
            }

            changed = true;
            return {
              ...document,
              id: match.id || document.id,
              status: nextStatus,
              chunkCount: nextChunkCount,
              uploadedAt: match.uploadedAt || document.uploadedAt,
            };
          });

          if (!changed) return previous;

          return {
            ...previous,
            [activeChat.id]: {
              ...chat,
              documents: nextDocuments,
            },
          };
        });
      } catch (error) {
        console.warn("[CHAT] Failed to refresh document status:", error);
      }
    };

    syncDocumentStatuses();
    const intervalId = window.setInterval(syncDocumentStatuses, 5000);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [
    activeChat?.id,
    activeDocuments,
    activeDocuments.length,
    documentRefreshKey,
    setChats,
    token,
  ]);

  // Scroll to bottom whenever the active conversation changes
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    });
  }, [activeChat?.id]);

  const handleProfileClick = (event) => setAnchorEl(event.currentTarget);
  const handleProfileClose = () => setAnchorEl(null);
  const handleLogout = () => {
    handleProfileClose();
    logout();
  };

  const getInitials = (username) =>
    username ? username.charAt(0).toUpperCase() : "U";

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#FAFAFA",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <AppBar position="sticky" color="transparent" elevation={0}>
        <Toolbar
          sx={{
            gap: 1.5,
            px: { xs: 2, md: 3 },
            minHeight: "64px !important",
          }}
        >
          <IconButton
            onClick={onToggleSidebar}
            edge="start"
            aria-label="Open conversations"
            sx={{ mr: 0.5 }}
          >
            <MenuIcon sx={{ fontSize: 20 }} />
          </IconButton>

          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="overline"
              sx={{ color: "#64748B", display: "block", lineHeight: 1.2 }}
            >
              CoRAG
            </Typography>
            <Typography
              variant="subtitle1"
              noWrap
              sx={{ lineHeight: 1.3, fontSize: "0.9rem" }}
            >
              {workspaceSummary.label}
            </Typography>
          </Box>

          <Stack direction="row" spacing={0.5} alignItems="center">
            <Tooltip title={activeKbId ? `Document library (KB filtered)` : `Document library (${documentCount})`}>
              <Badge
                badgeContent={readyDocuments > 0 ? readyDocuments : null}
                color="primary"
                overlap="circular"
              >
                <Badge
                  variant="dot"
                  invisible={!activeKbId}
                  color="secondary"
                  anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                >
                  <IconButton
                    onClick={() => setIsDocumentPanelOpen(true)}
                    data-tour="documents-button"
                    aria-label="Open document library"
                  >
                    {activeKbId ? (
                      <FolderSpecialOutlinedIcon sx={{ fontSize: 20, color: "#0052FF" }} />
                    ) : (
                      <FolderOutlinedIcon sx={{ fontSize: 20 }} />
                    )}
                  </IconButton>
                </Badge>
              </Badge>
            </Tooltip>

            <Tooltip title="Take a guided tour">
              <IconButton
                onClick={() => setRunTour(true)}
                aria-label="Start guided tour"
                sx={{ color: "#64748B" }}
              >
                <HelpOutlineIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>

            <Box
              sx={{
                width: 1,
                height: 24,
                backgroundColor: "#E2E8F0",
                mx: 0.5,
              }}
            />

            <IconButton
              onClick={handleProfileClick}
              sx={{ p: 0.5 }}
              aria-label="Open account menu"
            >
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  background: "linear-gradient(135deg, #0052FF, #4D7CFF)",
                  color: "#FFFFFF",
                  fontSize: "0.75rem",
                  fontFamily: '"JetBrains Mono", monospace',
                  fontWeight: 500,
                  border: "none",
                }}
              >
                {getInitials(user?.username)}
              </Avatar>
            </IconButton>
          </Stack>

          <Menu anchorEl={anchorEl} open={menuOpen} onClose={handleProfileClose}>
            <MenuItem disabled sx={{ opacity: "1 !important" }}>
              <PersonOutlineIcon sx={{ fontSize: 15, mr: 1.25 }} />
              {user?.username || "User"}
            </MenuItem>
            <Divider sx={{ borderColor: "#E2E8F0", my: 0.5 }} />
            <MenuItem onClick={handleLogout}>
              <LogoutIcon sx={{ fontSize: 15, mr: 1.25 }} />
              Sign out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Main content */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
          }}
        >
          {/* Chat column */}
          <Box
            sx={{
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Message area — fills remaining space, scrolls independently */}
            <Box
              ref={scrollContainerRef}
              sx={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                scrollBehavior: "smooth",
              }}
            >
              <Box
                sx={{
                  width: "100%",
                  maxWidth: 860,
                  mx: "auto",
                  px: { xs: 2, md: 4 },
                  pt: { xs: 3, md: 4 },
                  pb: { xs: 2, md: 3 },
                  minHeight: "100%",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {activeChat && activeChat.messages.length > 0 ? (
                  <MessageList
                    messages={activeChat.messages}
                    isTyping={isTyping}
                    scrollContainerRef={scrollContainerRef}
                  />
                ) : (
                  <WelcomeScreen />
                )}
              </Box>
            </Box>

            {/* Input area — sticky at bottom, never covers messages */}
            <Box
              sx={{
                flexShrink: 0,
                borderTop: "1px solid #E2E8F0",
                px: { xs: 2, md: 4 },
                py: { xs: 1.5, md: 2 },
                backgroundColor: "#FAFAFA",
                boxShadow: "0 -1px 6px rgba(15,23,42,0.04)",
              }}
            >
              <Box sx={{ width: "100%", maxWidth: 860, mx: "auto" }}>
                <ChatInput
                  query={query}
                  setQuery={setQuery}
                  onSend={handleSendQuery}
                  onStop={() => {
                    abortControllerRef.current?.abort();
                    setIsTyping(false);
                  }}
                  isTyping={isTyping}
                  topK={topK}
                  onTopKChange={(value) => {
                    setTopK(value);
                    try { localStorage.setItem(TOP_K_STORAGE_KEY, String(value)); } catch (_) {}
                  }}
                />
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Document library dialog */}
      <DocumentPanel
        open={isDocumentPanelOpen}
        onClose={() => setIsDocumentPanelOpen(false)}
      />

      <GuidedTour run={runTour} onFinish={() => setRunTour(false)} />
    </Box>
  );
}

export default Chat;
