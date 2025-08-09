// In frontend/src/components/Sidebar.js
import React, { useMemo, useState } from "react";
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
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ChatIcon from "@mui/icons-material/Chat";
import DeleteIcon from "@mui/icons-material/Delete";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import { useChat } from "../context/ChatContext";
import { DRAWER_WIDTH } from "../constants/layout";

const Sidebar = ({ isSidebarOpen, onClose }) => {
  const { chats, activeChatId, createNewChat, setActiveChatId, deleteChat } =
    useChat();
  const chatList = Object.values(chats);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState(null);

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

  const filteredChats = useMemo(() => {
    if (!search.trim()) return chatList;
    const s = search.toLowerCase();
    return chatList.filter((c) => c.title?.toLowerCase().includes(s));
  }, [chatList, search]);

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
      {/* Local header inside the Drawer for brand + close */}
      <Box
        sx={{
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Enhanced RASS
        </Typography>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ color: "text.secondary" }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box
        sx={{
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        <Box sx={{ p: 1 }}>
          <ListItemButton
            onClick={() => createNewChat()}
            sx={{
              borderRadius: 1,
              border: "1px solid",
              borderColor: "divider",
              justifyContent: "center",
              py: 1.5,
              "&:hover": { borderColor: "primary.main" },
            }}
          >
            <ListItemIcon sx={{ minWidth: "auto", mr: 1 }}>
              <AddIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="New Chat" />
          </ListItemButton>
        </Box>

        {/* Search/filter */}
        <Box sx={{ px: 1, pb: 1 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Search chats…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
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
                  pr: 1, // Reduce right padding to make room for delete button
                  "&:hover": { backgroundColor: "rgba(255,255,255,0.06)" },
                }}
              >
                <ListItemIcon>
                  <ChatIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={chat.title}
                  primaryTypographyProps={{
                    noWrap: true,
                    sx: { fontSize: "0.875rem" },
                  }}
                />
                <IconButton
                  size="small"
                  onClick={(event) => handleDeleteClick(event, chat)}
                  sx={{
                    opacity: 0,
                    transition: "opacity 0.2s",
                    ".MuiListItem-root:hover &": {
                      opacity: 1,
                    },
                    "&:hover": {
                      backgroundColor: "error.light",
                      color: "error.contrastText",
                    },
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemButton>
            </ListItem>
          ))}
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
