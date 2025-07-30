// In frontend/src/App.js (Lazy Loading Version)
import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Box, CircularProgress } from '@mui/material';
import ProtectedRoute from './components/ProtectedRoute'; // Import our new component

// Lazily import the main components
const MainLayout = React.lazy(() => import('./components/MainLayout'));
const AuthPage = React.lazy(() => import('./components/AuthPage'));

// A simple component to show while lazy components are loading
const LoadingFallback = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0f0f23' }}>
    <CircularProgress />
  </Box>
);

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Router>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to="/" /> : <AuthPage />}
          />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;