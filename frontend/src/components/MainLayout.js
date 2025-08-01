// In frontend/src/components/MainLayout.js
import React, { useState } from 'react';
import { ChatProvider } from '../context/ChatContext';
import { ThemeProvider, CssBaseline, Box, Toolbar } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { darkTheme } from '../theme';
import Header from './Header';
import Sidebar from './Sidebar';
import Chat from './Chat';
import DocumentPanel from './DocumentPanel';
import { DRAWER_WIDTH } from '../constants/layout';

const MainLayout = () => {
  const { logout } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDocumentPanelOpen, setIsDocumentPanelOpen] = useState(false);

  const handleToggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleToggleDocumentPanel = () => setIsDocumentPanelOpen(!isDocumentPanelOpen);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <ChatProvider>
      <Box sx={{ display: 'flex', height: '100vh' }}>
        <Header onToggleSidebar={handleToggleSidebar} onToggleDocumentSidebar={handleToggleDocumentPanel} />
        <Sidebar isSidebarOpen={isSidebarOpen} onLogout={logout} />

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            transition: (theme) => theme.transitions.create('margin', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
            marginLeft: `-${DRAWER_WIDTH}px`,
            ...(isSidebarOpen && {
              transition: (theme) => theme.transitions.create('margin', {
                easing: theme.transitions.easing.easeOut,
                duration: theme.transitions.duration.enteringScreen,
              }),
              marginLeft: 0,
            }),
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Toolbar /> {/* This is a crucial spacer */}
          <Chat />
        </Box>
        {/* 5. Render the new DocumentPanel */}
        <DocumentPanel
            isOpen={isDocumentPanelOpen}
            onClose={() => setIsDocumentPanelOpen(false)}
          />
      </Box>
      </ChatProvider>
    </ThemeProvider>
  );
};

export default MainLayout;