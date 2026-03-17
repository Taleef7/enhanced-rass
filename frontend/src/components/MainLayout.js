import React, { useEffect, useState } from "react";
import { Box, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { ChatProvider } from "../context/ChatContext";
import Sidebar from "./Sidebar";
import Chat from "./Chat";

const MainLayout = () => {
  const theme = useTheme();
  const hasPersistentSidebar = useMediaQuery(theme.breakpoints.up("lg"));
  const [isSidebarOpen, setIsSidebarOpen] = useState(hasPersistentSidebar);

  useEffect(() => {
    setIsSidebarOpen(hasPersistentSidebar);
  }, [hasPersistentSidebar]);

  return (
    <ChatProvider>
      <Box
        sx={{
          display: "flex",
          minHeight: "100vh",
          bgcolor: "background.default",
        }}
      >
        <Sidebar
          isSidebarOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        <Box
          component="main"
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: "100vh",
            display: "flex",
          }}
        >
          <Chat onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)} />
        </Box>
      </Box>
    </ChatProvider>
  );
};

export default MainLayout;
