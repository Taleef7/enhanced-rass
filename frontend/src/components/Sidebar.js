// In frontend/src/components/Sidebar.js
import React from "react";
import {
  Drawer,
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ChatIcon from "@mui/icons-material/Chat";
import { useChat } from "../context/ChatContext";
import { DRAWER_WIDTH } from "../constants/layout";

const Sidebar = ({ isSidebarOpen }) => {
  const { chats, activeChatId, createNewChat, setActiveChatId } = useChat();
  const chatList = Object.values(chats);

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
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>
    </Drawer>
  );
};

export default Sidebar;
