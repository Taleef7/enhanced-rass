// In frontend/src/components/ProtectedRoute.js
import React from 'react';
import { Navigate } from 'react-router-dom';
import { CircularProgress, Box } from '@mui/material';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  // Wait for the silent refresh attempt to complete before deciding whether
  // the user is authenticated. Without this, the app redirects to /login
  // before the refresh cookie has been checked.
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    // If the user is not authenticated, redirect them to the /login page
    return <Navigate to="/login" replace />;
  }

  // If they are authenticated, render the component they were trying to access
  return children;
};

export default ProtectedRoute;