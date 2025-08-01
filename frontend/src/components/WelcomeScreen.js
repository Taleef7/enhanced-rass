// In frontend/src/components/WelcomeScreen.js
import React from 'react';
import { Box, Typography, Avatar } from '@mui/material';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { useAuth } from '../context/AuthContext'; // We might use this later for the user's name

const WelcomeScreen = () => {
  // In a future step, we could get the user's name from useAuth()
  // const { user } = useAuth();
  // const greeting = user ? `Hello, ${user.username}` : 'Hello There';

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        p: 3,
        height: '100%',
      }}
    >
      <Avatar sx={{ width: 72, height: 72, mb: 3, bgcolor: 'background.paper' }}>
        <PsychologyIcon sx={{ fontSize: 48, color: 'primary.main' }} />
      </Avatar>
      <Typography
        variant="h4"
        sx={{
          fontWeight: 500,
          background: 'linear-gradient(45deg, #8ab4f8 30%, #f472b6 90%)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        How can I help you today?
      </Typography>
    </Box>
  );
};

export default WelcomeScreen;