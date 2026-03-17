import React from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Divider,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

const RelevanceBar = ({ score }) => {
  const rawScore = Number.isFinite(score) ? score : 0;
  const normalizedPercent =
    rawScore <= 1
      ? Math.max(0, Math.min(100, Math.round(rawScore * 100)))
      : Math.max(0, Math.min(100, Math.round((Math.min(rawScore, 10) / 10) * 100)));

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
      <Box sx={{ flex: 1, height: 2, backgroundColor: "#E2E8F0" }}>
        <Box
          sx={{
            height: "100%",
            width: `${normalizedPercent}%`,
            backgroundColor: "#0052FF",
            transition: "width 300ms",
          }}
        />
      </Box>
      <Typography
        sx={{
          fontSize: "0.6rem",
          fontFamily: '"JetBrains Mono", monospace',
          color: "#94A3B8",
          letterSpacing: "0.04em",
          flexShrink: 0,
          minWidth: 36,
          textAlign: "right",
        }}
      >
        {normalizedPercent}%
      </Typography>
    </Box>
  );
};

const ContextPanel = ({
  chunks = [],
  isStreaming = false,
  onClose,
  showCloseButton = false,
}) => {
  const hasChunks = chunks.length > 0;

  return (
    <Paper
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        border: "none",
        borderRadius: 0,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2.5,
          py: 2,
          borderBottom: "1px solid #E2E8F0",
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography
              variant="overline"
              sx={{ color: "#64748B", display: "block", mb: 0.25 }}
            >
              Evidence trace
            </Typography>
            <Typography
              variant="subtitle1"
              sx={{ fontSize: "0.88rem", fontWeight: 700 }}
            >
              Retrieved context
            </Typography>
          </Box>

          {showCloseButton ? (
            <Tooltip title="Close evidence panel">
              <IconButton size="small" onClick={onClose} sx={{ mt: -0.5 }}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          ) : null}
        </Stack>

        {/* Streaming indicator */}
        {isStreaming ? (
          <Box sx={{ mt: 1.5 }}>
            <Typography
              sx={{
                fontSize: "0.6rem",
                fontFamily: '"JetBrains Mono", monospace',
                color: "#64748B",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                mb: 0.75,
              }}
            >
              Retrieving…
            </Typography>
            <LinearProgress
              sx={{
                height: 2,
                backgroundColor: "#E2E8F0",
                "& .MuiLinearProgress-bar": {
                  backgroundColor: "#0052FF",
                },
              }}
            />
          </Box>
        ) : null}
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 2.5 }}>
        {!hasChunks && !isStreaming ? (
          <Box
            sx={{
              p: 2.5,
              border: "1px dashed #E2E8F0",
              textAlign: "center",
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{ mb: 0.75, fontSize: "0.7rem" }}
            >
              No context retrieved yet
            </Typography>
            <Typography
              sx={{
                fontSize: "0.72rem",
                color: "#94A3B8",
                lineHeight: 1.6,
                fontFamily: '"JetBrains Mono", monospace',
              }}
            >
              Ask a question to inspect the chunks RASS used while composing an answer.
            </Typography>
          </Box>
        ) : null}

        {hasChunks ? (
          <Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                mb: 2,
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{ fontSize: "0.65rem", letterSpacing: "0.1em" }}
              >
                Retrieved chunks
              </Typography>
              <Typography
                sx={{
                  fontSize: "0.6rem",
                  fontFamily: '"JetBrains Mono", monospace',
                  color: "#94A3B8",
                  border: "1px solid #E2E8F0",
                  px: 1,
                  py: 0.25,
                }}
              >
                {chunks.length} · hybrid
              </Typography>
            </Box>

            {chunks.map((chunk, index) => (
              <Accordion
                key={`${chunk.documentName || "chunk"}-${index}`}
                disableGutters
                defaultExpanded={index === 0}
                sx={{
                  mb: 1,
                  border: "1px solid #E2E8F0",
                  "&:hover": {
                    borderColor: "#0052FF",
                  },
                  "&.Mui-expanded": {
                    borderColor: "#0052FF",
                  },
                  transition: "border-color 100ms",
                }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}
                  sx={{ px: 1.75, py: 1.25, minHeight: "auto" }}
                >
                  <Box sx={{ width: "100%", pr: 1 }}>
                    <Stack direction="row" alignItems="center" gap={1} mb={0.75}>
                      <Box
                        sx={{
                          fontSize: "0.58rem",
                          fontFamily: '"JetBrains Mono", monospace',
                          color: "#94A3B8",
                          border: "1px solid #E2E8F0",
                          px: 0.75,
                          py: 0.1,
                          flexShrink: 0,
                        }}
                      >
                        #{index + 1}
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          fontSize: "0.78rem",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {chunk.documentName || `Chunk ${index + 1}`}
                      </Typography>
                    </Stack>
                    <RelevanceBar score={chunk.score} />
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 1.75, pb: 1.75, pt: 0 }}>
                  <Divider sx={{ mb: 1.5, borderColor: "#E2E8F0" }} />
                  <Typography
                    sx={{
                      fontSize: "0.78rem",
                      lineHeight: 1.7,
                      color: "#64748B",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontFamily: '"JetBrains Mono", monospace',
                    }}
                  >
                    {chunk.text}
                  </Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        ) : null}
      </Box>

      {/* Footer */}
      <Box
        sx={{
          px: 2.5,
          py: 1.5,
          borderTop: "1px solid #E2E8F0",
        }}
      >
        <Typography
          sx={{
            fontSize: "0.6rem",
            fontFamily: '"JetBrains Mono", monospace',
            color: "#94A3B8",
            letterSpacing: "0.03em",
            lineHeight: 1.6,
          }}
        >
          Read citations and retrieved context together before trusting an answer.
        </Typography>
      </Box>
    </Paper>
  );
};

export default ContextPanel;
