import React, { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ArticleOutlined as ArticleOutlinedIcon,
  Check as CheckIcon,
  CheckCircle as CheckCircleIcon,
  CommentOutlined as CommentOutlinedIcon,
  ContentCopy as CopyIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  ThumbDown as ThumbDownIcon,
  ThumbDownOutlined as ThumbDownOutlinedIcon,
  ThumbUp as ThumbUpIcon,
  ThumbUpOutlined as ThumbUpOutlinedIcon,
  WarningAmber as WarningAmberIcon,
} from "@mui/icons-material";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github.css";
import { useAuth } from "../context/AuthContext";

function isStructuredCitation(citation) {
  return citation && typeof citation.documentName === "string";
}

function StructuredCitationCard({ citation, onCitationClick, onAnnotate }) {
  const [expanded, setExpanded] = useState(false);
  const score =
    typeof citation.relevanceScore === "number"
      ? citation.relevanceScore.toFixed(3)
      : "N/A";
  const isGrounded = citation.grounded !== false;

  return (
    <Card
      variant="outlined"
      sx={{
        mb: 1,
        border: "1px solid",
        borderColor: isGrounded ? "#E2E8F0" : "#FECACA",
        backgroundColor: isGrounded ? "#FFFFFF" : "#FEF2F2",
        cursor: onCitationClick ? "pointer" : "default",
        transition: "all 150ms",
        "&:hover": {
          borderColor: "#0052FF",
          backgroundColor: isGrounded ? "rgba(0,82,255,0.04)" : "#FEF2F2",
          "& .citation-text": {
            color: "#0052FF",
          },
        },
      }}
      onClick={() => onCitationClick && onCitationClick(citation)}
    >
      <CardContent sx={{ py: 1.5, px: 1.75, "&:last-child": { pb: 1.5 } }}>
        <Stack direction="row" spacing={1.25} alignItems="flex-start">
          <Box
            sx={{
              width: 28,
              height: 28,
              border: "1px solid #E2E8F0",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              color: "#64748B",
            }}
          >
            <ArticleOutlinedIcon sx={{ fontSize: 14 }} />
          </Box>

          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack
              direction="row"
              spacing={1}
              justifyContent="space-between"
              alignItems="flex-start"
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  className="citation-text"
                  variant="body2"
                  sx={{ fontWeight: 600, fontSize: "0.78rem" }}
                  noWrap
                >
                  [{citation.index}] {citation.documentName}
                </Typography>
                <Typography
                  sx={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: "0.62rem",
                    color: "#94A3B8",
                    letterSpacing: "0.04em",
                    mt: 0.25,
                  }}
                >
                  Score {score}
                  {citation.pageNumber ? ` · p.${citation.pageNumber}` : ""}
                </Typography>
              </Box>

              <Stack direction="row" spacing={0.5} alignItems="center">
                <Tooltip
                  title={
                    isGrounded
                      ? "Grounded in retrieved context"
                      : "May not be fully grounded"
                  }
                >
                  {isGrounded ? (
                    <CheckCircleIcon sx={{ fontSize: 14, color: "#0052FF" }} />
                  ) : (
                    <WarningAmberIcon sx={{ fontSize: 14, color: "#64748B" }} />
                  )}
                </Tooltip>

                {onAnnotate ? (
                  <Tooltip title="Add annotation">
                    <IconButton
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation();
                        onAnnotate(citation);
                      }}
                      sx={{ p: 0.25 }}
                    >
                      <CommentOutlinedIcon sx={{ fontSize: 13 }} />
                    </IconButton>
                  </Tooltip>
                ) : null}
              </Stack>
            </Stack>

            {citation.excerpt ? (
              <Box sx={{ mt: 0.75 }}>
                <Button
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    setExpanded((previous) => !previous);
                  }}
                  endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  sx={{ px: 0, minWidth: 0, fontSize: "0.68rem" }}
                >
                  {expanded ? "Hide excerpt" : "Show excerpt"}
                </Button>
                <Collapse in={expanded}>
                  <Typography
                    variant="body2"
                    sx={{
                      mt: 0.75,
                      pl: 1.5,
                      borderLeft: "2px solid #0052FF",
                      color: "#64748B",
                      fontSize: "0.8rem",
                      lineHeight: 1.6,
                      fontStyle: "italic",
                    }}
                  >
                    &ldquo;{citation.excerpt}&rdquo;
                  </Typography>
                </Collapse>
              </Box>
            ) : null}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

const MessageBubble = ({ message, index }) => {
  const [copied, setCopied] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(
    () => Boolean(message.sources?.length)
  );
  const [feedbackSent, setFeedbackSent] = useState(null);
  const [feedbackSnackbar, setFeedbackSnackbar] = useState(false);
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [annotationCitation, setAnnotationCitation] = useState(null);
  const [annotationText, setAnnotationText] = useState("");
  const [annotationSnackbar, setAnnotationSnackbar] = useState(false);
  const { user, token } = useAuth();

  const isUser = message.sender === "user";
  const isSystem = message.sender === "system";
  const sources = message.sources || [];
  const useStructuredCitations =
    sources.length > 0 && isStructuredCitation(sources[0]);
  const initials = user?.username?.charAt(0)?.toUpperCase() || "U";

  const renderedText = useMemo(() => message.text || "", [message.text]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(renderedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleFeedback = async (signal) => {
    if (feedbackSent || !user) return;

    setFeedbackSent(signal);
    setFeedbackSnackbar(true);

    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          chatMessageId: message.id,
          type: "answer",
          signal,
          query: message.query || undefined,
        }),
      });
    } catch (error) {
      console.warn("[Feedback] Failed to submit feedback:", error);
    }
  };

  const handleCitationClick = async (citation) => {
    if (!user) return;

    try {
      await fetch("/api/feedback/implicit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          chatMessageId: message.id,
          feedbackType: "click",
          chunkId: citation.chunkId || undefined,
          documentId: citation.documentId || undefined,
          documentName: citation.documentName || undefined,
          query: message.query || undefined,
        }),
      });
    } catch (error) {
      console.warn("[Feedback] Failed to track citation click:", error);
    }
  };

  const handleAnnotationSubmit = async () => {
    if (!annotationCitation || !user) return;

    try {
      await fetch("/api/annotations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          chunkId:
            annotationCitation.chunkId ||
            annotationCitation.index?.toString() ||
            "unknown",
          documentId:
            annotationCitation.documentId ||
            annotationCitation.documentName ||
            "unknown",
          annotationType: "NOTE",
          content: annotationText,
        }),
      });
      setAnnotationSnackbar(true);
    } catch (error) {
      console.warn("[Annotation] Failed to submit annotation:", error);
    }

    setAnnotationOpen(false);
    setAnnotationText("");
    setAnnotationCitation(null);
  };

  // System message
  if (isSystem) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center" }}>
        <Box
          sx={{
            maxWidth: 720,
            width: "100%",
            border: "1px solid #E2E8F0",
            borderLeft: "3px solid #0052FF",
            borderRadius: "8px",
            px: 2,
            py: 1.25,
            backgroundColor: "#F1F5F9",
          }}
        >
          <Typography
            sx={{
              fontSize: "0.78rem",
              fontFamily: '"JetBrains Mono", monospace',
              color: "#64748B",
              letterSpacing: "0.02em",
              lineHeight: 1.6,
            }}
          >
            {renderedText}
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.025, 0.15) }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: isUser ? "flex-end" : "flex-start",
          alignItems: "flex-start",
          gap: 1.5,
        }}
      >
        {/* Bot avatar */}
        {!isUser ? (
          <Box
            sx={{
              width: 28,
              height: 28,
              border: "2px solid #0052FF",
              borderRadius: "8px",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              mt: 0.25,
            }}
          >
            <Typography
              sx={{
                fontSize: "0.6rem",
                fontFamily: '"JetBrains Mono", monospace',
                fontWeight: 700,
                letterSpacing: "0.05em",
                color: "#0052FF",
              }}
            >
              C
            </Typography>
          </Box>
        ) : null}

        <Box
          sx={{
            width: isUser ? "auto" : "100%",
            maxWidth: isUser ? 680 : 820,
          }}
        >
          {/* User message */}
          {isUser ? (
            <Paper
              sx={{
                px: 2.5,
                py: 1.75,
                border: "none",
                background: "linear-gradient(135deg, #0052FF, #4D7CFF)",
                borderRadius: "16px 16px 4px 16px",
                boxShadow: "0 4px 14px rgba(0,82,255,0.3)",
              }}
            >
              <Typography
                variant="body1"
                sx={{
                  color: "#FFFFFF",
                  lineHeight: 1.7,
                  fontSize: "0.92rem",
                }}
              >
                {renderedText}
              </Typography>
            </Paper>
          ) : (
            /* Bot message */
            <Paper
              sx={{
                px: { xs: 2, md: 2.5 },
                py: { xs: 1.75, md: 2 },
                border: "1px solid #E2E8F0",
                borderRadius: "4px 16px 16px 16px",
                backgroundColor: "#FFFFFF",
                boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
              }}
            >
              {/* Response header */}
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 1.5, pb: 1.5, borderBottom: "1px solid #E2E8F0" }}
              >
                <Typography
                  sx={{
                    fontSize: "0.6rem",
                    fontFamily: '"JetBrains Mono", monospace',
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#94A3B8",
                  }}
                >
                  CoRAG response
                </Typography>

                <Tooltip title={copied ? "Copied" : "Copy response"}>
                  <IconButton
                    size="small"
                    onClick={handleCopy}
                    sx={{ p: 0.5 }}
                  >
                    {copied ? (
                      <CheckIcon sx={{ fontSize: 14 }} />
                    ) : (
                      <CopyIcon sx={{ fontSize: 14 }} />
                    )}
                  </IconButton>
                </Tooltip>
              </Stack>

              {/* Markdown content */}
              <Box
                sx={{
                  fontSize: "0.92rem",
                  lineHeight: 1.75,
                  color: "#0F172A",
                  fontFamily: '"Inter", system-ui, sans-serif',
                  "& p": {
                    margin: "0 0 14px 0",
                    "&:last-child": { marginBottom: 0 },
                  },
                  "& h1, & h2, & h3, & h4": {
                    fontFamily: '"Calistoga", Georgia, serif',
                    fontWeight: 400,
                    letterSpacing: "-0.02em",
                    margin: "20px 0 10px",
                  },
                  "& pre": {
                    backgroundColor: "#F8FAFC",
                    padding: "12px 16px",
                    overflow: "auto",
                    border: "1px solid #E2E8F0",
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: "0.82rem",
                    lineHeight: 1.6,
                    margin: "14px 0",
                  },
                  "& code": {
                    backgroundColor: "#F8FAFC",
                    padding: "1px 5px",
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: "0.82rem",
                    border: "1px solid #E2E8F0",
                  },
                  "& ul, & ol": {
                    paddingLeft: "22px",
                    margin: "10px 0",
                  },
                  "& li": {
                    margin: "4px 0",
                  },
                  "& blockquote": {
                    margin: "16px 0",
                    paddingLeft: 16,
                    borderLeft: "3px solid #0052FF",
                    color: "#64748B",
                    fontStyle: "italic",
                  },
                  "& strong": {
                    fontWeight: 700,
                    color: "#0F172A",
                  },
                  "& a": {
                    color: "#0052FF",
                    textDecoration: "underline",
                  },
                  "& hr": {
                    border: "none",
                    borderTop: "1px solid #E2E8F0",
                    margin: "16px 0",
                  },
                  "& table": {
                    borderCollapse: "collapse",
                    width: "100%",
                    margin: "14px 0",
                    fontSize: "0.85rem",
                  },
                  "& th, & td": {
                    border: "1px solid #E2E8F0",
                    padding: "8px 12px",
                    textAlign: "left",
                  },
                  "& th": {
                    backgroundColor: "#F8FAFC",
                    fontWeight: 700,
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: "0.72rem",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  },
                  // Code highlighting: override github.css to be monochrome-friendly
                  "& .hljs": {
                    background: "transparent",
                    color: "#0F172A",
                    fontFamily: '"JetBrains Mono", monospace',
                  },
                }}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                >
                  {renderedText}
                </ReactMarkdown>
              </Box>

              {/* Citations section */}
              {sources.length > 0 ? (
                <Box
                  sx={{
                    mt: 2,
                    pt: 2,
                    borderTop: "1px solid #E2E8F0",
                  }}
                >
                  <Button
                    size="small"
                    onClick={() => setSourcesExpanded((previous) => !previous)}
                    endIcon={sourcesExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    sx={{ px: 0, fontSize: "0.68rem" }}
                  >
                    Citations ({sources.length})
                  </Button>

                  <Collapse in={sourcesExpanded}>
                    <Box sx={{ mt: 1.25 }}>
                      {useStructuredCitations ? (
                        sources.slice(0, 10).map((citation, citationIndex) => (
                          <StructuredCitationCard
                            key={`${citation.documentName}-${citationIndex}`}
                            citation={citation}
                            onCitationClick={handleCitationClick}
                            onAnnotate={(selectedCitation) => {
                              setAnnotationCitation(selectedCitation);
                              setAnnotationOpen(true);
                            }}
                          />
                        ))
                      ) : (
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                          {sources.slice(0, 10).map((source, sourceIndex) => (
                            <Chip
                              key={sourceIndex}
                              label={`${source.metadata?.source || "Unknown"} (${source.initial_score?.toFixed(3) ?? "N/A"})`}
                              variant="outlined"
                              size="small"
                            />
                          ))}
                        </Stack>
                      )}

                      {sources.length > 10 ? (
                        <Typography
                          sx={{
                            mt: 0.75,
                            fontSize: "0.65rem",
                            fontFamily: '"JetBrains Mono", monospace',
                            color: "#94A3B8",
                          }}
                        >
                          +{sources.length - 10} more citations
                        </Typography>
                      ) : null}
                    </Box>
                  </Collapse>
                </Box>
              ) : null}

              {/* Feedback row */}
              <Stack
                direction="row"
                spacing={0.5}
                alignItems="center"
                sx={{
                  mt: 1.75,
                  pt: 1.5,
                  borderTop: "1px solid #E2E8F0",
                }}
              >
                <Typography
                  sx={{
                    fontSize: "0.62rem",
                    fontFamily: '"JetBrains Mono", monospace',
                    color: "#94A3B8",
                    mr: 0.5,
                    letterSpacing: "0.04em",
                  }}
                >
                  Helpful?
                </Typography>
                <Tooltip title="Helpful">
                  <IconButton
                    size="small"
                    onClick={() => handleFeedback("positive")}
                    disabled={Boolean(feedbackSent)}
                    sx={{
                      p: 0.4,
                      color: feedbackSent === "positive" ? "#0052FF" : "#94A3B8",
                      backgroundColor: feedbackSent === "positive" ? "rgba(0,82,255,0.08)" : "transparent",
                    }}
                  >
                    {feedbackSent === "positive" ? (
                      <ThumbUpIcon sx={{ fontSize: 14 }} />
                    ) : (
                      <ThumbUpOutlinedIcon sx={{ fontSize: 14 }} />
                    )}
                  </IconButton>
                </Tooltip>
                <Tooltip title="Not helpful">
                  <IconButton
                    size="small"
                    onClick={() => handleFeedback("negative")}
                    disabled={Boolean(feedbackSent)}
                    sx={{
                      p: 0.4,
                      color: feedbackSent === "negative" ? "#0052FF" : "#94A3B8",
                      backgroundColor: feedbackSent === "negative" ? "rgba(0,82,255,0.08)" : "transparent",
                    }}
                  >
                    {feedbackSent === "negative" ? (
                      <ThumbDownIcon sx={{ fontSize: 14 }} />
                    ) : (
                      <ThumbDownOutlinedIcon sx={{ fontSize: 14 }} />
                    )}
                  </IconButton>
                </Tooltip>
              </Stack>
            </Paper>
          )}
        </Box>

        {/* User avatar */}
        {isUser ? (
          <Box
            sx={{
              width: 28,
              height: 28,
              border: "1px solid #C7D2FE",
              borderRadius: "8px",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              mt: 0.25,
              backgroundColor: "#EEF2FF",
            }}
          >
            <Typography
              sx={{
                fontSize: "0.6rem",
                fontFamily: '"JetBrains Mono", monospace',
                fontWeight: 700,
                color: "#0052FF",
              }}
            >
              {initials}
            </Typography>
          </Box>
        ) : null}
      </Box>

      {/* Annotation dialog */}
      <Dialog
        open={annotationOpen}
        onClose={() => setAnnotationOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Add annotation</DialogTitle>
        <DialogContent>
          {annotationCitation ? (
            <Typography
              sx={{
                display: "block",
                mb: 2,
                fontSize: "0.68rem",
                fontFamily: '"JetBrains Mono", monospace',
                color: "#64748B",
                letterSpacing: "0.04em",
              }}
            >
              [{annotationCitation.index}] {annotationCitation.documentName}
            </Typography>
          ) : null}
          <TextField
            autoFocus
            fullWidth
            multiline
            rows={4}
            label="Annotation"
            value={annotationText}
            onChange={(event) => setAnnotationText(event.target.value)}
            placeholder="Add a note, correction, or follow-up for this citation."
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            onClick={() => {
              setAnnotationOpen(false);
              setAnnotationText("");
            }}
            variant="outlined"
            size="small"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAnnotationSubmit}
            variant="contained"
            size="small"
            disabled={!annotationText.trim()}
          >
            Save annotation
          </Button>
        </DialogActions>
      </Dialog>

      {/* Feedback snackbar */}
      <Snackbar
        open={feedbackSnackbar}
        autoHideDuration={3000}
        onClose={() => setFeedbackSnackbar(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setFeedbackSnackbar(false)}
          severity="success"
          variant="filled"
        >
          Thanks for the feedback.
        </Alert>
      </Snackbar>

      {/* Annotation snackbar */}
      <Snackbar
        open={annotationSnackbar}
        autoHideDuration={3000}
        onClose={() => setAnnotationSnackbar(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setAnnotationSnackbar(false)}
          severity="success"
          variant="filled"
        >
          Annotation saved.
        </Alert>
      </Snackbar>
    </motion.div>
  );
};

export default MessageBubble;
