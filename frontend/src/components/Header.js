// In frontend/src/components/Header.js
import React from 'react';
import { AppBar, Toolbar, Typography, Box, IconButton } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import FolderIcon from '@mui/icons-material/Folder';

const Header = ({ onToggleSidebar, onToggleDocumentSidebar }) => {
  return (
    <AppBar
      position="fixed"
      // elevation={0}
      sx={{
        zIndex: (theme) => theme.zIndex.drawer + 1,
        borderBottom: 1,
        borderColor: 'divider',
        backgroundColor: 'background.default',
      }}
    >
      <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={onToggleSidebar} edge="start" color="inherit">
            <MenuIcon />
          </IconButton>
          <IconButton onClick={onToggleDocumentSidebar} color="inherit">
            <FolderIcon />
          </IconButton>
          <Typography variant="h6">Enhanced RASS</Typography>
        </Box>
        <Box>
          <IconButton color="inherit">
            <AccountCircleIcon />
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;