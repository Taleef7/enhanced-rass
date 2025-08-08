// In frontend/src/components/MainLayout.js
import React, { useState } from "react";
import { ChatProvider } from "../context/ChatContext";
import { ThemeProvider, CssBaseline, Box } from "@mui/material";
import { darkTheme } from "../theme";
import Sidebar from "./Sidebar";
import Chat from "./Chat";
import { DRAWER_WIDTH } from "../constants/layout";

const MainLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDocumentPanelOpen, setIsDocumentPanelOpen] = useState(false);

  const handleToggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleToggleDocumentPanel = () =>
    setIsDocumentPanelOpen(!isDocumentPanelOpen);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <ChatProvider>
        <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
          <Sidebar isSidebarOpen={isSidebarOpen} />

          <Box
            component="main"
            sx={{
              flexGrow: 1,
              transition: (theme) =>
                theme.transitions.create(["margin"], {
                  easing: theme.transitions.easing.sharp,
                  duration: theme.transitions.duration.leavingScreen,
                }),
              marginLeft: `-${DRAWER_WIDTH}px`,
              ...(isSidebarOpen && {
                transition: (theme) =>
                  theme.transitions.create(["margin"], {
                    easing: theme.transitions.easing.easeOut,
                    duration: theme.transitions.duration.enteringScreen,
                  }),
                marginLeft: 0,
              }),
              height: "100vh",
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              overflow: "hidden", // Prevent any scrolling on main container
            }}
          >
            <Chat
              onToggleSidebar={handleToggleSidebar}
              onToggleDocumentPanel={handleToggleDocumentPanel}
            />
          </Box>
        </Box>
      </ChatProvider>
    </ThemeProvider>
  );
};

export default MainLayout;
