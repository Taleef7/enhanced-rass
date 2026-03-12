// frontend/src/components/ExampleQueries.js
// Phase F (#131): Pre-populated example query chips shown on the welcome screen
// to help first-time users get started quickly.

import React from "react";
import { Box, Typography, Chip, Stack } from "@mui/material";
import LightbulbIcon from "@mui/icons-material/LightbulbOutlined";

const DEFAULT_EXAMPLES = [
  "Summarize the key findings from my uploaded documents",
  "What are the main risks identified in this report?",
  "List all action items and deadlines mentioned",
  "Compare the approaches described in these documents",
  "What does the document say about compliance requirements?",
  "Extract all statistics and numerical data mentioned",
];

const ExampleQueries = ({ onSelect, examples = DEFAULT_EXAMPLES }) => {
  if (!examples || examples.length === 0) return null;

  return (
    <Box sx={{ mt: 3, px: 1 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          mb: 1.5,
          justifyContent: "center",
        }}
      >
        <LightbulbIcon sx={{ fontSize: 14, color: "text.disabled" }} />
        <Typography variant="caption" color="text.disabled">
          Try an example
        </Typography>
      </Box>
      <Stack
        direction="row"
        flexWrap="wrap"
        gap={1}
        justifyContent="center"
      >
        {examples.map((query, idx) => (
          <Chip
            key={idx}
            label={query}
            size="small"
            variant="outlined"
            clickable
            onClick={() => onSelect && onSelect(query)}
            sx={{
              fontSize: "0.7rem",
              maxWidth: 280,
              height: "auto",
              py: 0.5,
              "& .MuiChip-label": {
                whiteSpace: "normal",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                lineHeight: 1.4,
              },
              cursor: "pointer",
              transition: "all 0.2s",
              "&:hover": {
                backgroundColor: "rgba(138,180,248,0.12)",
                borderColor: "primary.main",
                color: "primary.light",
              },
            }}
          />
        ))}
      </Stack>
    </Box>
  );
};

export default ExampleQueries;
