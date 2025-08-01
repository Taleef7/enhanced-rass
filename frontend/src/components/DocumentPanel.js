// In frontend/src/components/DocumentPanel.js
import React from 'react';
import { Drawer, Box, Typography, List, ListItem, ListItemText, IconButton, Toolbar, Divider } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useChat } from '../context/ChatContext';

const DOCUMENT_PANEL_WIDTH = 320;

const DocumentPanel = ({ isOpen, onClose }) => {
  const { activeChat } = useChat();
  const documents = activeChat ? activeChat.documents : [];

  return (
    <Drawer
      variant="persistent"
      anchor="right"
      open={isOpen}
      sx={{
        width: DOCUMENT_PANEL_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DOCUMENT_PANEL_WIDTH,
          boxSizing: 'border-box',
          backgroundColor: 'background.paper',
          borderLeft: '1px solid',
          borderColor: 'divider',
        },
      }}
    >
      <Toolbar /> {/* Spacer */}
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Chat Documents</Typography>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Divider />
      <List>
        {documents.length > 0 ? (
          documents.map((doc, index) => (
            <ListItem key={index}>
              <ListItemText primary={doc.name} secondary={`${(doc.size / 1024).toFixed(2)} KB`} />
            </ListItem>
          ))
        ) : (
          <ListItem>
            <ListItemText secondary="No documents uploaded for this chat." />
          </ListItem>
        )}
      </List>
    </Drawer>
  );
};

export default DocumentPanel;