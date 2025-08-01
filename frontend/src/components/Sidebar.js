// In frontend/src/components/Sidebar.js
import React from 'react';
import { Drawer, Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Divider, Button, Toolbar } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ChatIcon from '@mui/icons-material/Chat';
import LogoutIcon from '@mui/icons-material/Logout';
import { useChat } from '../context/ChatContext';
import { DRAWER_WIDTH } from '../constants/layout';

const Sidebar = ({ isSidebarOpen, onLogout }) => {

  const { chats, activeChatId, createNewChat, setActiveChatId } = useChat();
  const chatList = Object.values(chats);
  
  return (
    <Drawer 
      variant="persistent"
      open={isSidebarOpen}
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          backgroundColor: 'background.paper',
          borderRight: 'none',
        },
      }}
    >
      <Toolbar /> {/* Spacer to align content below the AppBar */}
      <Box sx={{ overflow: 'auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ p: 1 }}>
          <Button variant="outlined" fullWidth startIcon={<AddIcon />} onClick={createNewChat}>
            New Chat
          </Button>
        </Box>
        <List sx={{ flexGrow: 1, p: 1 }}>
          {chatList.map((chat) => (
            <ListItem key={chat.id} disablePadding>
              <ListItemButton
                selected={chat.id === activeChatId}
                onClick={() => setActiveChatId(chat.id)}
                sx={{ borderRadius: 1 }}
              >
                <ListItemIcon><ChatIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary={chat.title} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        <Divider />
        <Box sx={{ p: 2 }}>
          <Button variant="outlined" fullWidth startIcon={<LogoutIcon />} onClick={onLogout}>
            Logout
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
};

export default Sidebar;