// In frontend/src/components/Sidebar.js
import React from 'react';
import {
  Drawer, Box, List, ListItem, ListItemIcon, ListItemText,
  Divider, Chip, Badge, Typography, Button
} from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import DocumentIcon from '@mui/icons-material/Description';
import LogoutIcon from '@mui/icons-material/Logout';

import { DRAWER_WIDTH } from '../constants/layout';

const Sidebar = ({ selectedTab, setSelectedTab, uploadedDocuments, onLogout }) => {
  const menuItems = [
    { id: 'chat', label: 'Chat', icon: <ChatIcon />, badge: null },
    { id: 'documents', label: 'Documents', icon: <DocumentIcon />, badge: uploadedDocuments.length },
  ];

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <Box sx={{ overflow: 'hidden', flexGrow: 1, pt: '64px' }}>
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
                  '&:hover': { backgroundColor: 'primary.dark' },
                },
              }}
            >
              <ListItemIcon sx={{ color: selectedTab === item.id ? 'white' : 'text.secondary' }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                sx={{ '& .MuiListItemText-primary': { fontWeight: selectedTab === item.id ? 600 : 400 } }}
              />
              {item.badge > 0 && (
                <Badge badgeContent={item.badge} color="secondary" sx={{ ml: 'auto' }} />
              )}
            </ListItem>
          ))}
        </List>
        <Divider sx={{ my: 2 }} />
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
                    '& .MuiChip-icon': { fontSize: '1rem' }
                  }}
                />
              ))}
            </Box>
          </Box>
        )}
      </Box>

      <Box sx={{ p: 2, mt: 'auto' }}>
         <Button
            variant="outlined"
            color="secondary"
            fullWidth
            startIcon={<LogoutIcon />}
            onClick={onLogout}
          >
            Logout
          </Button>
      </Box>
    </Drawer>
  );
};

export default Sidebar;