import React, { useState } from 'react';
import { 
  ThemeProvider, 
  createTheme, 
  CssBaseline, 
  Box, 
  AppBar, 
  Toolbar, 
  Typography,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Chip,
  Badge
} from '@mui/material';
import { motion } from 'framer-motion';
import { 
  Psychology as PsychologyIcon,
  Chat as ChatIcon,
  Description as DocumentIcon
} from '@mui/icons-material';
import Chat from './components/Chat';
import DocumentManager from './components/DocumentManager';

// Create a professional dark theme
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#6366f1', // Indigo
      light: '#818cf8',
      dark: '#4f46e5',
    },
    secondary: {
      main: '#ec4899', // Pink
      light: '#f472b6',
      dark: '#db2777',
    },
    background: {
      default: '#0f0f23',
      paper: '#1a1a2e',
    },
    text: {
      primary: '#ffffff',
      secondary: '#a1a1aa',
    },
    divider: '#2d2d44',
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700 },
    h2: { fontWeight: 600 },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          borderRight: '1px solid #2d2d44',
        },
      },
    },
  },
});

const DRAWER_WIDTH = 280;

function App() {
  const [selectedTab, setSelectedTab] = useState('chat');
  const [uploadedDocuments, setUploadedDocuments] = useState([]);

  const handleDocumentUpload = (document) => {
    setUploadedDocuments(prev => [...prev, document]);
  };

  const menuItems = [
    { id: 'chat', label: 'Chat', icon: <ChatIcon />, badge: null },
    { id: 'documents', label: 'Documents', icon: <DocumentIcon />, badge: uploadedDocuments.length },
  ];

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', height: '100vh' }}>
        {/* App Bar */}
        <AppBar 
          position="fixed" 
          elevation={0} 
          sx={{ 
            zIndex: (theme) => theme.zIndex.drawer + 1,
            borderBottom: 1, 
            borderColor: 'divider',
            width: `calc(100% - ${DRAWER_WIDTH}px)`,
            left: DRAWER_WIDTH
          }}
        >
          <Toolbar>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, type: "spring" }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PsychologyIcon sx={{ fontSize: 28, color: 'primary.main' }} />
                <Typography variant="h6" sx={{ fontWeight: 700, background: 'linear-gradient(45deg, #6366f1 30%, #ec4899 90%)', backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  Enhanced RASS
                </Typography>
              </Box>
            </motion.div>
          </Toolbar>
        </AppBar>

        {/* Sidebar */}
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              pt: '64px', // Account for AppBar height
            },
          }}
        >
          <Box sx={{ overflow: 'auto', height: '100%' }}>
            {/* Navigation Menu */}
            <List sx={{ pt: 2 }}>
              {menuItems.map((item) => (
                <ListItem
                  key={item.id}
                  button
                  selected={selectedTab === item.id}
                  onClick={() => setSelectedTab(item.id)}
                  sx={{
                    mx: 1,
                    borderRadius: 2,
                    mb: 0.5,
                    '&.Mui-selected': {
                      backgroundColor: 'primary.main',
                      '&:hover': {
                        backgroundColor: 'primary.dark',
                      },
                    },
                  }}
                >
                  <ListItemIcon sx={{ color: selectedTab === item.id ? 'white' : 'text.secondary' }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText 
                    primary={item.label} 
                    sx={{ 
                      '& .MuiListItemText-primary': {
                        fontWeight: selectedTab === item.id ? 600 : 400,
                      }
                    }}
                  />
                  {item.badge !== null && (
                    <Badge 
                      badgeContent={item.badge} 
                      color="secondary"
                      sx={{ ml: 'auto' }}
                    />
                  )}
                </ListItem>
              ))}
            </List>

            <Divider sx={{ my: 2 }} />

            {/* Uploaded Documents */}
            {uploadedDocuments.length > 0 && (
              <Box sx={{ px: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>
                  Uploaded Documents
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {uploadedDocuments.map((doc, index) => (
                    <Chip
                      key={index}
                      label={doc.name}
                      size="small"
                      variant="outlined"
                      icon={<DocumentIcon />}
                      sx={{ 
                        fontSize: '0.75rem',
                        '& .MuiChip-icon': {
                          fontSize: '1rem'
                        }
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </Drawer>

        {/* Main Content */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            ml: `${DRAWER_WIDTH}px`,
            pt: '64px', // Account for AppBar height
            height: '100vh',
            overflow: 'hidden'
          }}
        >
          <motion.div
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
                onDocumentUpload={handleDocumentUpload}
              />
            )}
          </motion.div>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;
