// In frontend/src/App.js (Lazy Loading Version)
import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Box, CircularProgress } from '@mui/material';
import ProtectedRoute from './components/ProtectedRoute'; // Import our new component

// Lazily import the main components
const MainLayout = React.lazy(() => import('./components/MainLayout'));
const AuthPage = React.lazy(() => import('./components/AuthPage'));
// Phase G #138: Shareable chat view (public, no auth required)
const SharedChatView = React.lazy(() => import('./components/SharedChatView'));

// Wrapper that extracts the :token param via useParams (React Router pattern)
function SharedChatRoute() {
  const { token } = useParams();
  return <SharedChatView token={token} />;
}

// A simple component to show while lazy components are loading
const LoadingFallback = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0f0f23' }}>
    <CircularProgress />
  </Box>
);

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Router>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route
            path="/login"
            // Don't redirect to "/" until the silent refresh attempt finishes —
            // otherwise a page reload during a valid session briefly flashes /login.
            element={isLoading ? <LoadingFallback /> : isAuthenticated ? <Navigate to="/" /> : <AuthPage />}
          />
          {/* Phase G #138: Public shared chat view */}
          <Route
            path="/shared/:token"
            element={<SharedChatRoute />}
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