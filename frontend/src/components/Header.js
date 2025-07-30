// In frontend/src/components/Header.js
import React from 'react';
import { AppBar, Toolbar, Typography, Box } from '@mui/material';
import { motion } from 'framer-motion';
import PsychologyIcon from '@mui/icons-material/Psychology';

const DRAWER_WIDTH = 280;

const Header = () => {
  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        zIndex: (theme) => theme.zIndex.drawer + 1,
        borderBottom: 1,
        borderColor: 'divider',
        width: `calc(100% - ${DRAWER_WIDTH}px)`,
        left: DRAWER_WIDTH,
        backgroundImage: 'none',
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
            <Typography variant="h6" sx={{
              fontWeight: 700,
              background: 'linear-gradient(45deg, #6366f1 30%, #ec4899 90%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Enhanced RASS
            </Typography>
          </Box>
        </motion.div>
      </Toolbar>
    </AppBar>
  );
};

export default Header;