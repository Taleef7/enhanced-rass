import React, { Suspense } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useParams,
} from "react-router-dom";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  CircularProgress,
  Typography,
} from "@mui/material";
import { useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import { monoTheme as darkTheme } from "./theme";

const MainLayout = React.lazy(() => import("./components/MainLayout"));
const AuthPage = React.lazy(() => import("./components/AuthPage"));
const SharedChatView = React.lazy(() => import("./components/SharedChatView"));

function SharedChatRoute() {
  const { token } = useParams();
  return <SharedChatView token={token} />;
}

const LoadingFallback = () => (
  <Box
    sx={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      px: 3,
    }}
  >
    <Box
      sx={{
        display: "grid",
        justifyItems: "center",
        gap: 2,
        textAlign: "center",
      }}
    >
      <CircularProgress />
      <Typography variant="body2" color="text.secondary">
        Loading the RASS workspace...
      </Typography>
    </Box>
  </Box>
);

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Router>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route
              path="/login"
              element={
                isLoading ? (
                  <LoadingFallback />
                ) : isAuthenticated ? (
                  <Navigate to="/" />
                ) : (
                  <AuthPage />
                )
              }
            />
            <Route path="/shared/:token" element={<SharedChatRoute />} />
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
    </ThemeProvider>
  );
}

export default App;
