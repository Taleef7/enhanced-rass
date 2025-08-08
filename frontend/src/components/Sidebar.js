// In frontend/src/components/Sidebar.js
import React, { useState } from "react";
import {
  Drawer,
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ChatIcon from "@mui/icons-material/Chat";
import DeleteIcon from "@mui/icons-material/Delete";
import { useChat } from "../context/ChatContext";
import { DRAWER_WIDTH } from "../constants/layout";

const Sidebar = ({ isSidebarOpen }) => {
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

  return (
    <Drawer
      variant="persistent"
      open={isSidebarOpen}
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: DRAWER_WIDTH,
          boxSizing: "border-box",
          backgroundColor: "background.paper",
          borderRight: "none",
        },
      }}
    >
      <Toolbar /> {/* Spacer to align content below the AppBar */}
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
            }}
          >
            <ListItemIcon sx={{ minWidth: "auto", mr: 1 }}>
              <AddIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="New Chat" />
          </ListItemButton>
        </Box>
        <List sx={{ flexGrow: 1, p: 1 }}>
          {chatList.map((chat) => (
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
