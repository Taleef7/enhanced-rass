import React from "react";
import { Box, Typography } from "@mui/material";

const WelcomeScreen = () => {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        minHeight: "40vh",
        gap: 1,
        userSelect: "none",
      }}
    >
      <Typography
        sx={{
          fontSize: "2rem",
          fontWeight: 700,
          letterSpacing: "-0.03em",
          color: "#0F172A",
        }}
      >
        CoRAG
      </Typography>
      <Typography
        sx={{
          fontSize: "0.9rem",
          color: "#94A3B8",
          fontFamily: '"Inter", system-ui, sans-serif',
        }}
      >
        Ask a question or upload a document to begin.
      </Typography>
    </Box>
  );
};

export default WelcomeScreen;
