// In frontend/src/components/Sidebar.js
import React, { useMemo, useState, useRef } from "react";
import {
  Drawer,
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  TextField,
  InputAdornment,
  Tooltip,
  Menu,
  MenuItem,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ChatIcon from "@mui/icons-material/Chat";
import DeleteIcon from "@mui/icons-material/Delete";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import EditIcon from "@mui/icons-material/Edit";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useChat } from "../context/ChatContext";
import { DRAWER_WIDTH } from "../constants/layout";

const Sidebar = ({ isSidebarOpen, onClose }) => {
  const {
    chats,
    activeChatId,
    createNewChat,
    setActiveChatId,
    deleteChat,
    updateChatTitle,
  } = useChat();
  const chatList = Object.values(chats);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuChatId, setMenuChatId] = useState(null);
  const editStartRef = useRef(0);

  const handleDeleteClick = (event, chat) => {
    event.stopPropagation(); // Prevent selecting the chat when clicking delete
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

  const [search, setSearch] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const filteredChats = useMemo(() => {
    if (!search.trim()) return chatList;
    const s = search.toLowerCase();
    return chatList.filter((c) => c.title?.toLowerCase().includes(s));
  }, [chatList, search]);

  const openActionsMenu = (event, chat) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuChatId(chat.id);
  };

  const closeActionsMenu = () => {
    setMenuAnchor(null);
    setMenuChatId(null);
  };

  return (
    <Drawer
      variant="temporary"
      open={isSidebarOpen}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: DRAWER_WIDTH,
          boxSizing: "border-box",
          backgroundColor: "rgba(22,22,22,0.9)",
          backdropFilter: "blur(10px)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
          // Keep the global header visible and clickable above the Drawer
          top: 60,
          height: "calc(100% - 60px)",
        },
      }}
    >
      {/* Removed redundant local header (brand text and close icon).
      The global AppBar already shows the title and provides the hamburger
      to toggle this Drawer. */}
      <Box
        sx={{
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        {/* New Chat - simplified modern list item */}
        <Box sx={{ p: 1 }}>
          <ListItemButton
            onClick={() => createNewChat()}
            sx={{
              borderRadius: 2,
              py: 1,
              px: 1.25,
              backgroundColor: "transparent",
              "&:hover": { backgroundColor: "rgba(255,255,255,0.06)" },
            }}
          >
            <ListItemIcon sx={{ minWidth: "auto", mr: 1 }}>
              <AddIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="New chat"
              primaryTypographyProps={{ sx: { fontSize: "0.9rem" } }}
            />
          </ListItemButton>
        </Box>

        {/* Search: icon that expands into a text field */}
        <Box sx={{ px: 1, pb: 1 }}>
          {!isSearchOpen ? (
            <Tooltip title="Search chats">
              <IconButton
                size="small"
                onClick={() => setIsSearchOpen(true)}
                sx={{ color: "text.secondary" }}
              >
                <SearchIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : (
            <TextField
              size="small"
              fullWidth
              autoFocus
              placeholder="Search chats…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => {
                        setIsSearchOpen(false);
                        setSearch("");
                      }}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          )}
        </Box>
        <List sx={{ flexGrow: 1, p: 1 }}>
          {filteredChats.map((chat) => (
            <ListItem key={chat.id} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                selected={chat.id === activeChatId}
                onClick={() => setActiveChatId(chat.id)}
                sx={{
                  borderRadius: 1,
                  "&.Mui-selected": {
                    backgroundColor: "action.selected",
                  },
                  pr: 1,
                  "&:hover": { backgroundColor: "rgba(255,255,255,0.06)" },
                }}
              >
                <ListItemIcon>
                  <ChatIcon fontSize="small" />
                </ListItemIcon>
                {editingId === chat.id ? (
                  <TextField
                    size="small"
                    value={editValue}
                    autoFocus
                    onChange={(e) => setEditValue(e.target.value)}
                    onFocus={() => {
                      editStartRef.current = Date.now();
                    }}
                    onBlur={async () => {
                      // Prevent immediate blur right after switching to edit mode
                      if (Date.now() - editStartRef.current < 150) return;
                      const val = editValue.trim() || "Untitled";
                      await updateChatTitle(chat.id, val);
                      setEditingId(null);
                    }}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        const val = editValue.trim() || "Untitled";
                        await updateChatTitle(chat.id, val);
                        setEditingId(null);
                      } else if (e.key === "Escape") {
                        setEditingId(null);
                      }
                    }}
                    variant="standard"
                    fullWidth
                  />
                ) : (
                  <ListItemText
                    primary={chat.title}
                    primaryTypographyProps={{
                      noWrap: true,
                      sx: { fontSize: "0.875rem" },
                    }}
                  />
                )}
                <IconButton
                  size="small"
                  onClick={(event) => openActionsMenu(event, chat)}
                  sx={{
                    ml: 0.5,
                    opacity: 0,
                    transition: "opacity 0.2s",
                    ".MuiListItem-root:hover &": {
                      opacity: 1,
                    },
                  }}
                >
                  <MoreVertIcon fontSize="small" />
                </IconButton>
              </ListItemButton>
            </ListItem>
          ))}

          {/* Per-item actions menu */}
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
                  const title = chat.title || "";
                  // Close the menu first to avoid stealing focus from the TextField
                  closeActionsMenu();
                  setTimeout(() => {
                    setEditingId(chat.id);
                    setEditValue(title);
                    editStartRef.current = Date.now();
                  }, 50);
                }
              }}
            >
              <ListItemIcon>
                <EditIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Rename" />
            </MenuItem>
            <MenuItem
              onClick={(e) => {
                const chat = chats[menuChatId];
                if (chat) {
                  handleDeleteClick(e, chat);
                }
                closeActionsMenu();
              }}
            >
              <ListItemIcon>
                <DeleteIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary="Delete" />
            </MenuItem>
          </Menu>
        </List>

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={deleteDialogOpen}
          onClose={handleDeleteCancel}
          aria-labelledby="delete-chat-dialog-title"
        >
          <DialogTitle id="delete-chat-dialog-title">Delete Chat</DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to delete "{chatToDelete?.title}"? This
              action cannot be undone.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Note: Any documents uploaded in this chat will remain available in
              your document library and other chats.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleDeleteCancel}>Cancel</Button>
            <Button
              onClick={handleDeleteConfirm}
              color="error"
              variant="contained"
            >
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Drawer>
  );
};

export default Sidebar;
