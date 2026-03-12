import React, { useState } from "react";
import {
  Box,
  Paper,
  Avatar,
  Tooltip,
  Collapse,
  Button,
  Chip,
  IconButton,
  Typography,
  Card,
  CardContent,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from "@mui/material";
import {
  Check as CheckIcon,
  ContentCopy as CopyIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  WarningAmber as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Article as ArticleIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
  ThumbUpOutlined as ThumbUpOutlinedIcon,
  ThumbDownOutlined as ThumbDownOutlinedIcon,
  Comment as CommentIcon,
} from "@mui/icons-material";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { useAuth } from "../context/AuthContext";

/**
 * Determines whether a citation object is the new structured format (Issue #117)
 * or the legacy format.
 */
function isStructuredCitation(citation) {
  return citation && typeof citation.documentName === "string";
}

/**
 * Renders a single structured citation card.
 */
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
        backgroundColor: "rgba(255,255,255,0.03)",
        borderColor: isGrounded
          ? "rgba(255,255,255,0.1)"
          : "warning.dark",
        cursor: onCitationClick ? "pointer" : "default",
      }}
      onClick={() => onCitationClick && onCitationClick(citation)}
    >
      <CardContent sx={{ py: 1.5, px: 2, "&:last-child": { pb: 1.5 } }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}>
            <ArticleIcon sx={{ fontSize: 16, color: "primary.main", flexShrink: 0 }} />
            <Typography
              variant="caption"
              sx={{ fontWeight: 600, color: "text.primary", lineHeight: 1.3 }}
            >
              [{citation.index}] {citation.documentName}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
            {isGrounded ? (
              <Tooltip title="Citation grounded in retrieved context">
                <CheckCircleIcon sx={{ fontSize: 14, color: "success.main" }} />
              </Tooltip>
            ) : (
              <Tooltip title="Citation may not be grounded in retrieved context">
                <WarningIcon sx={{ fontSize: 14, color: "warning.main" }} />
              </Tooltip>
            )}
            <Chip
              label={`Score: ${score}`}
              size="small"
              sx={{ fontSize: "0.65rem", height: 18 }}
              variant="outlined"
            />
            {citation.pageNumber && (
              <Chip
                label={`p.${citation.pageNumber}`}
                size="small"
                sx={{ fontSize: "0.65rem", height: 18 }}
                variant="outlined"
              />
            )}
            {onAnnotate && (
              <Tooltip title="Add annotation">
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); onAnnotate(citation); }}
                  sx={{ p: 0.25 }}
                >
                  <CommentIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        {citation.excerpt && (
          <Box sx={{ mt: 1 }}>
            <Button
              size="small"
              onClick={() => setExpanded(!expanded)}
              endIcon={expanded ? <ExpandLessIcon sx={{ fontSize: 14 }} /> : <ExpandMoreIcon sx={{ fontSize: 14 }} />}
              sx={{
                color: "text.secondary",
                textTransform: "none",
                p: 0,
                minWidth: "auto",
                fontSize: "0.7rem",
              }}
            >
              {expanded ? "Hide excerpt" : "Show excerpt"}
            </Button>
            <Collapse in={expanded}>
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  mt: 0.5,
                  color: "text.secondary",
                  fontStyle: "italic",
                  lineHeight: 1.5,
                  borderLeft: "2px solid",
                  borderColor: "primary.main",
                  pl: 1,
                }}
              >
                "{citation.excerpt}"
              </Typography>
            </Collapse>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

const MessageBubble = ({ message, index }) => {
  const [copied, setCopied] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  // Phase G #134: Adaptive retrieval feedback
  const [feedbackSent, setFeedbackSent] = useState(null); // 'positive' | 'negative' | null
  const [feedbackSnackbar, setFeedbackSnackbar] = useState(false);
  // Phase G #138: Annotation dialog
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [annotationCitation, setAnnotationCitation] = useState(null);
  const [annotationText, setAnnotationText] = useState("");
  const [annotationSnackbar, setAnnotationSnackbar] = useState(false);
  const { user } = useAuth();
  const isUser = message.sender === "user";

  const getInitials = (username) => {
    if (!username) return "U";
    return username.charAt(0).toUpperCase();
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFeedback = async (signal) => {
    if (feedbackSent || !user) return; // Only once per message
    setFeedbackSent(signal);
    setFeedbackSnackbar(true);
    try {
      const token = localStorage.getItem("accessToken");
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
    } catch (err) {
      console.warn("[Feedback] Failed to submit feedback:", err);
    }
  };

  const handleCitationClick = async (citation) => {
    // Phase G #134: Track citation clicks as implicit feedback
    if (!user) return;
    try {
      const token = localStorage.getItem("accessToken");
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
    } catch (err) {
      // Non-fatal
    }
  };

  const handleAnnotationSubmit = async () => {
    if (!annotationCitation || !user) return;
    try {
      const token = localStorage.getItem("accessToken");
      await fetch("/api/annotations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          chunkId: annotationCitation.chunkId || annotationCitation.index?.toString() || "unknown",
          documentId: annotationCitation.documentId || annotationCitation.documentName || "unknown",
          annotationType: "NOTE",
          content: annotationText,
        }),
      });
      setAnnotationSnackbar(true);
    } catch (err) {
      console.warn("[Annotation] Failed to submit annotation:", err);
    }
    setAnnotationOpen(false);
    setAnnotationText("");
    setAnnotationCitation(null);
  };

  const sources = message.sources || [];
  const useStructuredCitations = sources.length > 0 && isStructuredCitation(sources[0]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: isUser ? "flex-end" : "flex-start",
          alignItems: "flex-start",
          gap: 2,
          width: "100%",
        }}
      >
        {!isUser && (
          <Avatar
            sx={{
              bgcolor: "primary.main",
              width: 32,
              height: 32,
              fontSize: "0.875rem",
              flexShrink: 0,
              mt: 0.5,
            }}
          >
            AI
          </Avatar>
        )}

        <Box
          sx={{
            maxWidth: isUser ? "70%" : "100%", // User messages narrower, AI full width
            width: isUser ? "auto" : "100%",
            position: "relative",
          }}
        >
          {isUser ? (
            // User message: bubble style like Gemini
            <Paper
              elevation={1}
              sx={{
                p: 2.5,
                borderRadius: "18px",
                backgroundColor: "primary.main",
                color: "white",
                position: "relative",
                wordBreak: "break-word",
              }}
            >
              <Box
                sx={{
                  fontSize: "0.95rem",
                  lineHeight: 1.5,
                }}
              >
                {message.text}
              </Box>
            </Paper>
          ) : (
            // AI message: plain text style like Gemini
            <Box sx={{ position: "relative" }}>
              <Box
                sx={{
                  fontSize: "0.95rem",
                  lineHeight: 1.6,
                  color: "text.primary",
                  "& p": {
                    margin: "0 0 16px 0",
                    "&:last-child": {
                      marginBottom: 0,
                    },
                  },
                  "& pre": {
                    backgroundColor: "rgba(255,255,255,0.04)",
                    color: "grey.100",
                    padding: "12px 16px",
                    borderRadius: "8px",
                    overflow: "auto",
                    fontSize: "0.875rem",
                    margin: "12px 0",
                    border: "1px solid rgba(255,255,255,0.06)",
                  },
                  "& code": {
                    backgroundColor: "rgba(255,255,255,0.06)",
                    color: "grey.100",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    fontSize: "0.875rem",
                  },
                  "& ul, & ol": {
                    paddingLeft: "24px",
                    margin: "8px 0",
                  },
                  "& li": {
                    marginBottom: "4px",
                  },
                  "& h1, & h2, & h3, & h4, & h5, & h6": {
                    margin: "16px 0 8px 0",
                    fontWeight: 600,
                  },
                  "& blockquote": {
                    borderLeft: "4px solid",
                    borderColor: "primary.main",
                    paddingLeft: "16px",
                    margin: "16px 0",
                    fontStyle: "italic",
                  },
                }}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    code({ node, inline, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      return !inline && match ? (
                        <Box
                          component="pre"
                          sx={{
                            backgroundColor: "rgba(0,0,0,0.1)",
                            borderRadius: 1,
                            p: 1,
                            overflow: "auto",
                            fontSize: "0.875rem",
                            maxWidth: "100%",
                          }}
                        >
                          <code className={className} {...props}>
                            {children}
                          </code>
                        </Box>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {message.text}
                </ReactMarkdown>
              </Box>

              {/* Copy button for AI messages */}
              <Tooltip title={copied ? "Copied!" : "Copy message"}>
                <IconButton
                  size="small"
                  onClick={handleCopy}
                  className="copy-button"
                  sx={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    opacity: 0,
                    transition: "opacity 0.2s, transform 0.2s",
                    color: "text.secondary",
                    transform: "translateY(-2px)",
                    "&:hover": { opacity: 1, transform: "translateY(0)" },
                  }}
                >
                  {copied ? (
                    <CheckIcon fontSize="small" />
                  ) : (
                    <CopyIcon fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>

              {/* Sources section */}
              {Array.isArray(message.sources) && message.sources.length > 0 && (
                <Box
                  sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: "divider" }}
                >
                  <Button
                    size="small"
                    onClick={() => setSourcesExpanded(!sourcesExpanded)}
                    endIcon={
                      sourcesExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />
                    }
                    sx={{
                      color: "text.secondary",
                      textTransform: "none",
                      p: 0,
                      minWidth: "auto",
                      fontSize: "0.875rem",
                    }}
                  >
                    {useStructuredCitations ? "Citations" : "Sources"} ({message.sources.length})
                  </Button>

                  <Collapse in={sourcesExpanded}>
                    <Box sx={{ mt: 2 }}>
                      {useStructuredCitations ? (
                        // Structured citation cards (Phase C #117)
                        <Box>
                          {message.sources.slice(0, 10).map((citation, i) => (
                            <StructuredCitationCard
                              key={i}
                              citation={citation}
                              onCitationClick={handleCitationClick}
                              onAnnotate={(c) => {
                                setAnnotationCitation(c);
                                setAnnotationOpen(true);
                              }}
                            />
                          ))}
                          {message.sources.length > 10 && (
                            <Typography
                              variant="caption"
                              sx={{ color: "text.secondary", ml: 1 }}
                            >
                              +{message.sources.length - 10} more citations
                            </Typography>
                          )}
                        </Box>
                      ) : (
                        // Legacy chip display
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                          {message.sources.slice(0, 10).map((source, i) => (
                            <Chip
                              key={i}
                              label={`${source.metadata?.source || "Unknown"} (${source.initial_score?.toFixed(3) ?? "N/A"})`}
                              size="small"
                              variant="outlined"
                              sx={{
                                fontSize: "0.75rem",
                                cursor: "pointer",
                                "&:hover": {
                                  backgroundColor: "action.hover",
                                },
                              }}
                              onClick={() => {
                                console.log("View source:", source);
                              }}
                            />
                          ))}
                          {message.sources.length > 10 && (
                            <Chip
                              label={`+${message.sources.length - 10} more`}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: "0.75rem" }}
                            />
                          )}
                        </Box>
                      )}
                    </Box>
                  </Collapse>
                </Box>
              )}

              {/* Phase G #134: Answer-level feedback buttons */}
              {!isUser && (
                <Box sx={{ mt: 2, display: "flex", gap: 1, alignItems: "center" }}>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Was this helpful?
                  </Typography>
                  <Tooltip title="Helpful">
                    <IconButton
                      size="small"
                      onClick={() => handleFeedback("positive")}
                      disabled={!!feedbackSent}
                      sx={{ color: feedbackSent === "positive" ? "success.main" : "text.secondary" }}
                    >
                      {feedbackSent === "positive" ? <ThumbUpIcon sx={{ fontSize: 16 }} /> : <ThumbUpOutlinedIcon sx={{ fontSize: 16 }} />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Not helpful">
                    <IconButton
                      size="small"
                      onClick={() => handleFeedback("negative")}
                      disabled={!!feedbackSent}
                      sx={{ color: feedbackSent === "negative" ? "error.main" : "text.secondary" }}
                    >
                      {feedbackSent === "negative" ? <ThumbDownIcon sx={{ fontSize: 16 }} /> : <ThumbDownOutlinedIcon sx={{ fontSize: 16 }} />}
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
            </Box>
          )}
        </Box>

        {/* Phase G #138: Annotation dialog */}
        <Dialog open={annotationOpen} onClose={() => setAnnotationOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Add Annotation</DialogTitle>
          <DialogContent>
            {annotationCitation && (
              <Typography variant="caption" sx={{ display: "block", mb: 2, color: "text.secondary" }}>
                Annotating: [{annotationCitation.index}] {annotationCitation.documentName}
              </Typography>
            )}
            <TextField
              autoFocus
              multiline
              rows={4}
              fullWidth
              label="Annotation note"
              value={annotationText}
              onChange={(e) => setAnnotationText(e.target.value)}
              placeholder="Add your note, correction, or flag..."
              variant="outlined"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setAnnotationOpen(false); setAnnotationText(""); }}>Cancel</Button>
            <Button onClick={handleAnnotationSubmit} variant="contained" disabled={!annotationText.trim()}>
              Save Annotation
            </Button>
          </DialogActions>
        </Dialog>

        {/* Feedback success snackbar */}
        <Snackbar
          open={feedbackSnackbar}
          autoHideDuration={3000}
          onClose={() => setFeedbackSnackbar(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity="success" onClose={() => setFeedbackSnackbar(false)} sx={{ width: "100%" }}>
            Thanks for your feedback!
          </Alert>
        </Snackbar>

        {/* Annotation success snackbar */}
        <Snackbar
          open={annotationSnackbar}
          autoHideDuration={3000}
          onClose={() => setAnnotationSnackbar(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert severity="success" onClose={() => setAnnotationSnackbar(false)} sx={{ width: "100%" }}>
            Annotation saved!
          </Alert>
        </Snackbar>

        {isUser && (
          <Avatar
            sx={{
              bgcolor: "secondary.main",
              width: 32,
              height: 32,
              fontSize: "0.875rem",
              flexShrink: 0,
              mt: 0.5,
            }}
          >
            {getInitials(user?.username)}
          </Avatar>
        )}
      </Box>
    </motion.div>
  );
};

export default MessageBubble;
