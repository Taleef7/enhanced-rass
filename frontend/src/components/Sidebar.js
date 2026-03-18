import React, { useEffect, useDeferredValue, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FolderSpecialOutlinedIcon from "@mui/icons-material/FolderSpecialOutlined";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import SearchIcon from "@mui/icons-material/Search";
import { fetchKnowledgeBases } from "../apiClient";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { DRAWER_WIDTH } from "../constants/layout";

const Sidebar = ({ isSidebarOpen, onClose }) => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("lg"));
  const { token } = useAuth();
  const {
    chats,
    activeChatId,
    createNewChat,
    setActiveChatId,
    deleteChat,
    updateChatTitle,
    activeKbId,
    setActiveKbId,
  } = useChat();

  const [knowledgeBases, setKnowledgeBases] = useState([]);

  useEffect(() => {
    if (!token) return;
    fetchKnowledgeBases(token)
      .then((response) => setKnowledgeBases(response.data || []))
      .catch((err) => console.warn("[Sidebar] Failed to load KBs:", err));
  }, [token]);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuChatId, setMenuChatId] = useState(null);
  const [search, setSearch] = useState("");
  const editStartRef = useRef(0);
  const deferredSearch = useDeferredValue(search);
  const chatList = Object.values(chats);

  const filteredChats = useMemo(() => {
    const normalized = deferredSearch.trim().toLowerCase();
    if (!normalized) return chatList;
    return chatList.filter((chat) =>
      (chat.title || "").toLowerCase().includes(normalized)
    );
  }, [chatList, deferredSearch]);

  const closeActionsMenu = () => {
    setMenuAnchor(null);
    setMenuChatId(null);
  };

  const openActionsMenu = (event, chatId) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuChatId(chatId);
  };

  const handleDeleteClick = (event, chat) => {
    event.stopPropagation();
    setChatToDelete(chat);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (chatToDelete) {
      await deleteChat(chatToDelete.id);
      setDeleteDialogOpen(false);
      setChatToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setChatToDelete(null);
  };

  const handleRenameStart = (chat) => {
    closeActionsMenu();
    setEditingId(chat.id);
    setEditValue(chat.title || "");
    editStartRef.current = Date.now();
  };

  const handleRenameSubmit = async (chatId) => {
    const title = editValue.trim() || "Untitled chat";
    await updateChatTitle(chatId, title);
    setEditingId(null);
  };

  const drawerContent = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "background.paper",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2.5,
          pt: 3,
          pb: 2.5,
          borderBottom: "1px solid #E2E8F0",
        }}
      >
        <Typography
          variant="overline"
          sx={{ color: "#64748B", display: "block", mb: 0.5 }}
        >
          Workspace
        </Typography>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            mb: 2.5,
          }}
        >
          CoRAG
        </Typography>

        <Button
          fullWidth
          variant="contained"
          startIcon={<AddIcon sx={{ fontSize: 16 }} />}
          onClick={async () => {
            await createNewChat();
            if (!isDesktop) onClose();
          }}
          data-tour="new-chat"
          sx={{
            py: 1.25,
            justifyContent: "flex-start",
            gap: 0.5,
          }}
        >
          New conversation
        </Button>

        {/* Knowledge Base selector */}
        {knowledgeBases.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.75 }}>
              <FolderSpecialOutlinedIcon sx={{ fontSize: 13, color: "#64748B" }} />
              <Typography
                sx={{
                  fontSize: "0.6rem",
                  fontFamily: '"JetBrains Mono", monospace',
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "#64748B",
                  fontWeight: 600,
                }}
              >
                Knowledge base
              </Typography>
            </Box>
            <Select
              size="small"
              fullWidth
              displayEmpty
              value={activeKbId || ""}
              onChange={(e) => setActiveKbId(e.target.value || null)}
              sx={{
                fontSize: "0.78rem",
                fontFamily: '"JetBrains Mono", monospace',
                "& .MuiSelect-select": { py: 0.75 },
              }}
            >
              <MenuItem value="">
                <Typography sx={{ fontSize: "0.78rem", color: "#94A3B8" }}>
                  All documents
                </Typography>
              </MenuItem>
              {knowledgeBases.map((kb) => (
                <MenuItem key={kb.id} value={kb.id}>
                  <Typography sx={{ fontSize: "0.78rem" }} noWrap>
                    {kb.name}
                  </Typography>
                </MenuItem>
              ))}
            </Select>
          </Box>
        )}
      </Box>

      {/* Search */}
      <Box sx={{ px: 2, py: 2, borderBottom: "1px solid #E2E8F0" }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search conversations"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: "#64748B" }} />
              </InputAdornment>
            ),
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              fontSize: "0.8rem",
              fontFamily: '"JetBrains Mono", monospace',
            },
          }}
        />
      </Box>

      {/* Conversation list */}
      <List
        sx={{
          flex: 1,
          px: 0,
          pb: 2,
          overflowY: "auto",
        }}
      >
        {filteredChats.length > 0 ? (
          filteredChats.map((chat) => {
            const isActive = chat.id === activeChatId;

            return (
              <Box key={chat.id}>
                <ListItemButton
                  selected={isActive}
                  onClick={() => {
                    setActiveChatId(chat.id);
                    if (!isDesktop) onClose();
                  }}
                  sx={{
                    px: 2.5,
                    py: 1.25,
                    borderBottom: "1px solid #E2E8F0",
                    borderLeft: isActive ? "3px solid #0052FF" : "3px solid transparent",
                    backgroundColor: isActive ? "rgba(0,82,255,0.08)" : "transparent",
                    "&.Mui-selected": {
                      backgroundColor: "rgba(0,82,255,0.08)",
                      "&:hover": {
                        backgroundColor: "rgba(0,82,255,0.12)",
                      },
                    },
                    "&:hover": {
                      backgroundColor: "rgba(0,82,255,0.04)",
                    },
                    gap: 1,
                    alignItems: "flex-start",
                    transition: "none",
                  }}
                >
                  <ListItemText
                    primary={
                      editingId === chat.id ? (
                        <TextField
                          autoFocus
                          size="small"
                          fullWidth
                          value={editValue}
                          onChange={(event) => setEditValue(event.target.value)}
                          onFocus={() => {
                            editStartRef.current = Date.now();
                          }}
                          onBlur={async () => {
                            if (Date.now() - editStartRef.current < 120) return;
                            await handleRenameSubmit(chat.id);
                          }}
                          onKeyDown={async (event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              await handleRenameSubmit(chat.id);
                            }
                            if (event.key === "Escape") {
                              setEditingId(null);
                            }
                          }}
                          variant="standard"
                          sx={{
                            "& .MuiInput-underline:before": {
                              borderBottom: "1px solid #E2E8F0",
                            },
                            "& .MuiInput-underline:after": {
                              borderBottom: "2px solid #0052FF",
                            },
                          }}
                        />
                      ) : (
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: isActive ? 600 : 400,
                            fontSize: "0.82rem",
                            lineHeight: 1.4,
                            color: isActive ? "#0F172A" : "#0F172A",
                          }}
                          noWrap
                        >
                          {chat.title || "Untitled chat"}
                        </Typography>
                      )
                    }
                    secondary={
                      <Typography
                        component="span"
                        sx={{
                          display: "block",
                          mt: 0.25,
                          fontSize: "0.62rem",
                          fontFamily: '"JetBrains Mono", monospace',
                          color: "#94A3B8",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {(chat.messages || []).length} messages
                      </Typography>
                    }
                    sx={{ my: 0 }}
                  />

                  <Tooltip title="Conversation actions">
                    <IconButton
                      size="small"
                      onClick={(event) => openActionsMenu(event, chat.id)}
                      sx={{
                        flexShrink: 0,
                        opacity: isActive ? 1 : 0,
                        ".MuiListItemButton-root:hover &": {
                          opacity: 1,
                        },
                        p: 0.5,
                      }}
                    >
                      <MoreHorizIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </ListItemButton>
              </Box>
            );
          })
        ) : (
          <Box
            sx={{
              mx: 2.5,
              mt: 2,
              p: 2.5,
              border: "1px dashed #CBD5E1",
              borderRadius: "8px",
              textAlign: "center",
            }}
          >
            <Typography
              variant="body2"
              sx={{ fontSize: "0.78rem", color: "#64748B" }}
            >
              No matching conversations.
            </Typography>
            <Typography
              sx={{
                display: "block",
                mt: 0.5,
                fontSize: "0.65rem",
                fontFamily: '"JetBrains Mono", monospace',
                color: "#94A3B8",
              }}
            >
              Create a new chat or clear the search.
            </Typography>
          </Box>
        )}
      </List>


      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeActionsMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItem
          onClick={() => {
            const chat = chats[menuChatId];
            if (chat) {
              handleRenameStart(chat);
            }
          }}
          sx={{ gap: 1.25 }}
        >
          <EditOutlinedIcon sx={{ fontSize: 15 }} />
          Rename
        </MenuItem>
        <MenuItem
          onClick={(event) => {
            const chat = chats[menuChatId];
            if (chat) {
              handleDeleteClick(event, chat);
            }
            closeActionsMenu();
          }}
          sx={{ gap: 1.25 }}
        >
          <DeleteOutlineIcon sx={{ fontSize: 15 }} />
          Delete
        </MenuItem>
      </Menu>

      <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel} maxWidth="xs" fullWidth>
        <DialogTitle>Delete conversation</DialogTitle>
        <DialogContent>
          <Typography
            variant="body2"
            sx={{ color: "#64748B", lineHeight: 1.6 }}
          >
            Delete &ldquo;{chatToDelete?.title}&rdquo; and remove its history from this workspace. Uploaded documents remain available in your library.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={handleDeleteCancel} variant="outlined" size="small">
            Cancel
          </Button>
          <Button variant="contained" size="small" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );

  return (
    <Drawer
      open={isSidebarOpen}
      onClose={onClose}
      variant={isDesktop ? "persistent" : "temporary"}
      ModalProps={{ keepMounted: true }}
      sx={{
        width: isDesktop && isSidebarOpen ? DRAWER_WIDTH : 0,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: DRAWER_WIDTH,
          boxSizing: "border-box",
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
};

export default Sidebar;
