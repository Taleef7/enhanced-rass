import React, { useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { loginUser, registerUser } from "../apiClient";
import { useAuth } from "../context/AuthContext";

const AUTH_PILLARS = [
  {
    icon: <ArticleOutlinedIcon sx={{ fontSize: 16 }} />,
    title: "Document grounded",
    body: "Upload PDFs, Word docs, and text files — CoRAG retrieves the most relevant passages for every question.",
  },
  {
    icon: <VerifiedOutlinedIcon sx={{ fontSize: 16 }} />,
    title: "Cited answers",
    body: "Every response includes inline [N] citations and source metadata so you always know where the answer came from.",
  },
  {
    icon: <AutoAwesomeOutlinedIcon sx={{ fontSize: 16 }} />,
    title: "Conversation memory",
    body: "CoRAG reformulates follow-up questions using conversation history for coherent multi-turn dialogue.",
  },
];

const AuthForm = ({ isLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const normalizedUsername = username.trim();

      if (normalizedUsername.length < 3) {
        setError("Username must be at least 3 characters long.");
        return;
      }

      if (password.length < 8) {
        setError("Password must be at least 8 characters long.");
        return;
      }

      if (isLogin) {
        const response = await loginUser(normalizedUsername, password);
        login(response.data.token);
      } else {
        await registerUser(normalizedUsername, password);
        const response = await loginUser(normalizedUsername, password);
        login(response.data.token);
      }
    } catch (err) {
      setError(err.response?.data?.error || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography
            sx={{
              fontSize: "0.62rem",
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#64748B",
              mb: 0.75,
              display: "block",
            }}
            component="label"
            htmlFor="username-field"
          >
            Username
          </Typography>
          <TextField
            id="username-field"
            fullWidth
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={isLoading}
            autoComplete="username"
            placeholder="Enter username (min. 3 chars)"
            size="small"
            sx={{
              "& .MuiInputBase-input": {
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: "0.85rem",
              },
            }}
          />
        </Box>

        <Box>
          <Typography
            sx={{
              fontSize: "0.62rem",
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#64748B",
              mb: 0.75,
              display: "block",
            }}
            component="label"
            htmlFor="password-field"
          >
            Password
          </Typography>
          <TextField
            id="password-field"
            type="password"
            fullWidth
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isLoading}
            autoComplete={isLogin ? "current-password" : "new-password"}
            placeholder="Enter password (min. 8 chars)"
            size="small"
            sx={{
              "& .MuiInputBase-input": {
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: "0.85rem",
              },
            }}
          />
        </Box>

        {error ? (
          <Box
            sx={{
              px: 2,
              py: 1.25,
              border: "1px solid #FECACA",
              backgroundColor: "#FEF2F2",
              borderRadius: "8px",
            }}
          >
            <Typography
              sx={{
                fontSize: "0.72rem",
                fontFamily: '"JetBrains Mono", monospace',
                color: "#DC2626",
                letterSpacing: "0.03em",
              }}
            >
              {error}
            </Typography>
          </Box>
        ) : null}

        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="large"
          disabled={isLoading}
          endIcon={!isLoading && <ArrowForwardIcon sx={{ fontSize: 16 }} />}
          sx={{ mt: 1 }}
        >
          {isLoading ? (
            <CircularProgress size={18} sx={{ color: "#FFFFFF" }} />
          ) : isLogin ? (
            "Sign in"
          ) : (
            "Create account"
          )}
        </Button>
      </Stack>
    </Box>
  );
};

const AuthPage = () => {
  const [value, setValue] = useState(0);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        alignItems: "center",
        px: { xs: 2, md: 4 },
        py: { xs: 3, md: 5 },
        backgroundColor: "#FFFFFF",
        // Subtle grid texture
        backgroundImage: `
          linear-gradient(rgba(0,82,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,82,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: "48px 48px",
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 1100,
          mx: "auto",
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "1.1fr 0.9fr" },
          gap: 0,
          border: "1px solid #E2E8F0",
          borderRadius: "16px",
          backgroundColor: "#FFFFFF",
          boxShadow: "0 20px 60px rgba(15,23,42,0.08), 0 8px 24px rgba(0,82,255,0.06)",
        }}
      >
        {/* Left panel — Brand & features */}
        <Box
          sx={{
            p: { xs: 3, md: 5 },
            borderRight: { lg: "1px solid #E2E8F0" },
            borderBottom: { xs: "1px solid #E2E8F0", lg: "none" },
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: { lg: 560 },
          }}
        >
          <Box>
            {/* Brand mark */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 4 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  background: "linear-gradient(135deg, #0052FF, #4D7CFF)",
                  borderRadius: "8px",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Typography
                  sx={{
                    color: "#FFFFFF",
                    fontSize: "0.65rem",
                    fontFamily: '"JetBrains Mono", monospace',
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                  }}
                >
                  C
                </Typography>
              </Box>
              <Typography
                sx={{
                  fontSize: "0.62rem",
                  fontFamily: '"JetBrains Mono", monospace',
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "#64748B",
                }}
              >
                CoRAG
              </Typography>
            </Box>

            {/* Headline */}
            <Typography
              variant="h2"
              sx={{
                maxWidth: 480,
                mb: 2,
                fontSize: { xs: "1.75rem", md: "2.2rem" },
              }}
            >
              Ask questions. Get cited answers from your documents.
            </Typography>

            {/* Thick rule */}
            <Box sx={{ width: 40, height: 4, backgroundColor: "#0052FF", borderRadius: "2px", mb: 2.5 }} />

            <Typography
              sx={{
                color: "#64748B",
                fontSize: "0.9rem",
                lineHeight: 1.75,
                maxWidth: 460,
              }}
            >
              Upload documents, ask questions in natural language, and get
              answers with inline source citations — no setup required.
            </Typography>
          </Box>

          {/* Feature pillars */}
          <Stack spacing={0} sx={{ mt: { xs: 3, md: 5 } }}>
            {AUTH_PILLARS.map((pillar, idx) => (
              <Box
                key={pillar.title}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: 2,
                  alignItems: "start",
                  py: 2,
                  borderTop: "1px solid #E2E8F0",
                  borderBottom: idx === AUTH_PILLARS.length - 1 ? "1px solid #E2E8F0" : "none",
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    border: "none",
                    backgroundColor: "rgba(0,82,255,0.08)",
                    borderRadius: "8px",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    color: "#0052FF",
                  }}
                >
                  {pillar.icon}
                </Box>
                <Box>
                  <Typography
                    variant="subtitle2"
                    sx={{ mb: 0.5, fontSize: "0.68rem" }}
                  >
                    {pillar.title}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "0.8rem",
                      color: "#64748B",
                      lineHeight: 1.6,
                    }}
                  >
                    {pillar.body}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>

        {/* Right panel — Auth form */}
        <Box
          sx={{
            p: { xs: 3, md: 5 },
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <Typography
            variant="overline"
            sx={{ display: "block", mb: 0.5, color: "#64748B" }}
          >
            Workspace access
          </Typography>
          <Typography
            variant="h4"
            sx={{ mb: 0.75, fontSize: "1.4rem" }}
          >
            {value === 0 ? "Sign in" : "Create account"}
          </Typography>
          <Typography
            sx={{
              fontSize: "0.82rem",
              color: "#64748B",
              lineHeight: 1.6,
              mb: 2,
            }}
          >
            {value === 0
              ? "Return to your chats and document library."
              : "Set up an account to start uploading documents and querying with citations."}
          </Typography>

          {/* Mode tabs */}
          <Box sx={{ borderBottom: "1px solid #E2E8F0", mb: 0 }}>
            <Tabs
              value={value}
              onChange={(_, nextValue) => setValue(nextValue)}
              sx={{
                minHeight: 40,
              }}
            >
              <Tab
                label="Login"
                sx={{
                  minHeight: 40,
                  py: 0,
                  px: 2,
                  fontSize: "0.68rem",
                }}
              />
              <Tab
                label="Register"
                sx={{
                  minHeight: 40,
                  py: 0,
                  px: 2,
                  fontSize: "0.68rem",
                }}
              />
            </Tabs>
          </Box>

          {value === 0 ? <AuthForm isLogin /> : <AuthForm isLogin={false} />}
        </Box>
      </Box>
    </Box>
  );
};

export default AuthPage;
