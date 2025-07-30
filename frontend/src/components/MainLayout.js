// In frontend/src/components/MainLayout.js (Refactored)
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ThemeProvider, CssBaseline, Box } from '@mui/material';
import { motion } from 'framer-motion';
import { darkTheme } from '../theme'; // Import the theme
import Header from './Header'; // Import new components
import Sidebar from './Sidebar'; // Import new components
import Chat from './Chat';
import DocumentManager from './DocumentManager';

const DRAWER_WIDTH = 280;

function MainLayout() {
  const [selectedTab, setSelectedTab] = useState('chat');
  const [uploadedDocuments, setUploadedDocuments] = useState([]);
  const { logout } = useAuth(); // <-- 2. Get the logout function

  const handleDocumentUpload = (document) => {
    setUploadedDocuments(prev => [...prev, document]);
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', height: '100vh' }}>
        <Header />
        <Sidebar
          selectedTab={selectedTab}
          setSelectedTab={setSelectedTab}
          uploadedDocuments={uploadedDocuments}
          onLogout={logout}
        />
        {/* Main Content */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            ml: `${DRAWER_WIDTH}px`,
            pt: '64px',
            height: '100vh',
            overflow: 'hidden'
          }}
        >
          <motion.div
            key={selectedTab} // Add key to re-trigger animation on tab change
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            style={{ height: '100%' }}
          >
            {selectedTab === 'chat' ? (
              <Chat
                uploadedDocuments={uploadedDocuments}
                onDocumentUpload={handleDocumentUpload}
              />
            ) : (
              <DocumentManager
                uploadedDocuments={uploadedDocuments}
                onDocument-upload={handleDocumentUpload}
              />
            )}
          </motion.div>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default MainLayout;