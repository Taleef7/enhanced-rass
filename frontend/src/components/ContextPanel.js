// frontend/src/components/ContextPanel.js
// Phase F (#129): "What RASS is thinking" transparency panel.
// Shows retrieved chunks, retrieval scores, and model reasoning for the current
// query in real-time as the SSE stream progresses.

import React from "react";
import {
  Box,
  Typography,
  Paper,
  Chip,
  Divider,
  LinearProgress,
  Tooltip,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ArticleIcon from "@mui/icons-material/Article";

const ScoreBar = ({ score }) => {
  const pct = Math.round((score || 0) * 100);
  const color =
    pct >= 80 ? "success" : pct >= 50 ? "warning" : "error";
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <LinearProgress
        variant="determinate"
        value={pct}
        color={color}
        sx={{ flex: 1, height: 4, borderRadius: 2 }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 32 }}>
        {pct}%
      </Typography>
    </Box>
  );
};

const ContextPanel = ({ chunks = [], isStreaming = false, onClose }) => {
  const hasChunks = chunks.length > 0;

  return (
    <Paper
      elevation={4}
      sx={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 380,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "rgba(15,15,35,0.97)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        zIndex: 10,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 1,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
        }}
      >
        <AutoAwesomeIcon sx={{ color: "#f472b6", fontSize: 20 }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            What RASS is thinking
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Retrieved context &amp; reasoning
          </Typography>
        </Box>
        <Tooltip title="Close panel">
          <IconButton size="small" onClick={onClose} sx={{ color: "text.secondary" }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 1.5 }}>
        {/* Streaming indicator */}
        {isStreaming && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <SearchIcon sx={{ fontSize: 14, color: "primary.main" }} />
              <Typography variant="caption" color="primary.main" sx={{ fontWeight: 600 }}>
                Retrieving relevant context…
              </Typography>
            </Box>
            <LinearProgress variant="indeterminate" sx={{ height: 2, borderRadius: 1 }} />
          </Box>
        )}

        {/* No chunks yet */}
        {!isStreaming && !hasChunks && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              py: 6,
              gap: 1.5,
            }}
          >
            <AutoAwesomeIcon sx={{ fontSize: 36, color: "rgba(255,255,255,0.12)" }} />
            <Typography variant="caption" color="text.disabled" textAlign="center">
              Ask a question to see what context
              <br />
              RASS retrieves from your documents.
            </Typography>
          </Box>
        )}

        {/* Retrieved chunks */}
        {hasChunks && (
          <>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mb: 1.5,
              }}
            >
              <SearchIcon sx={{ fontSize: 14, color: "success.main" }} />
              <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                {chunks.length} context chunk{chunks.length !== 1 ? "s" : ""} retrieved
              </Typography>
            </Box>

            {chunks.map((chunk, idx) => (
              <Accordion
                key={idx}
                disableGutters
                elevation={0}
                sx={{
                  mb: 1,
                  backgroundColor: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "8px !important",
                  "&:before": { display: "none" },
                  "&.Mui-expanded": { mb: 1 },
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon sx={{ fontSize: 14 }} />}
                  sx={{
                    px: 1.5,
                    py: 0.5,
                    minHeight: 40,
                    "& .MuiAccordionSummary-content": { my: 0.5 },
                  }}
                >
                  <Box sx={{ width: "100%" }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        mb: 0.5,
                      }}
                    >
                      <ArticleIcon sx={{ fontSize: 12, color: "primary.main" }} />
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: 600, color: "text.primary", flex: 1 }}
                        noWrap
                      >
                        {chunk.documentName || `Chunk ${idx + 1}`}
                      </Typography>
                      <Chip
                        label={`[${idx + 1}]`}
                        size="small"
                        sx={{ fontSize: "0.6rem", height: 16, px: 0 }}
                        variant="outlined"
                      />
                    </Box>
                    <ScoreBar score={chunk.score} />
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 1.5, pt: 0, pb: 1.5 }}>
                  <Divider sx={{ mb: 1, opacity: 0.3 }} />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: "block",
                      lineHeight: 1.6,
                      fontFamily: "monospace",
                      fontSize: "0.7rem",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      maxHeight: 200,
                      overflowY: "auto",
                    }}
                  >
                    {chunk.text}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </>
        )}
      </Box>

      {/* Footer */}
      <Box
        sx={{
          px: 2,
          py: 1,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
        }}
      >
        <Typography variant="caption" color="text.disabled">
          Hybrid retrieval: KNN vector + BM25 keyword search
        </Typography>
      </Box>
    </Paper>
  );
};

export default ContextPanel;
