import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

const DEFAULT_EXAMPLES = [
  "Summarize the key findings from my uploaded documents.",
  "What are the main risks identified in this report?",
  "List all action items and deadlines mentioned.",
  "Compare the approaches described in these documents.",
];

const ExampleQueries = ({ onSelect, examples = DEFAULT_EXAMPLES }) => {
  if (!examples || examples.length === 0) return null;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2.5 }}>
        <Typography
          variant="subtitle2"
          sx={{ fontSize: "0.65rem", letterSpacing: "0.12em" }}
        >
          Suggested starting points
        </Typography>
        <Box sx={{ flex: 1, height: 1, backgroundColor: "#E2E8F0" }} />
      </Box>

      <Stack spacing={0}>
        {examples.map((query, index) => (
          <Box
            key={query}
            onClick={() => onSelect && onSelect(query)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect && onSelect(query);
              }
            }}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
              px: 2,
              py: 1.75,
              borderTop: "1px solid #E2E8F0",
              borderBottom: index === examples.length - 1 ? "1px solid #E2E8F0" : "none",
              cursor: "pointer",
              transition: "all 100ms",
              "&:hover": {
                backgroundColor: "rgba(0,82,255,0.04)",
                "& .query-text": {
                  color: "#0052FF",
                },
                "& .query-arrow": {
                  color: "#0052FF",
                  transform: "translateX(4px)",
                },
                "& .query-index": {
                  color: "#94A3B8",
                },
              },
              "&:focus-visible": {
                outline: "3px solid #0052FF",
                outlineOffset: 2,
              },
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
              <Typography
                className="query-index"
                sx={{
                  fontSize: "0.6rem",
                  fontFamily: '"JetBrains Mono", monospace',
                  color: "#94A3B8",
                  letterSpacing: "0.04em",
                  flexShrink: 0,
                  width: 16,
                }}
              >
                {String(index + 1).padStart(2, "0")}
              </Typography>
              <Typography
                className="query-text"
                variant="body2"
                sx={{
                  fontSize: "0.85rem",
                  lineHeight: 1.5,
                  color: "#0F172A",
                  transition: "color 100ms",
                }}
              >
                {query}
              </Typography>
            </Box>

            <ArrowForwardIcon
              className="query-arrow"
              sx={{
                fontSize: 16,
                color: "#94A3B8",
                flexShrink: 0,
                transition: "transform 100ms, color 100ms",
              }}
            />
          </Box>
        ))}
      </Stack>
    </Box>
  );
};

export default ExampleQueries;
