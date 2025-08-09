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
} from "@mui/material";
import {
  Check as CheckIcon,
  ContentCopy as CopyIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
} from "@mui/icons-material";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { useAuth } from "../context/AuthContext";

const MessageBubble = ({ message, index }) => {
  const [copied, setCopied] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const { user } = useAuth();
  const isUser = message.sender === "user";

  // Get user's initials for avatar
  const getInitials = (username) => {
    if (!username) return "U";
    return username.charAt(0).toUpperCase();
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
                    Sources ({message.sources.length})
                  </Button>

                  <Collapse in={sourcesExpanded}>
                    <Box sx={{ mt: 2 }}>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                        {Array.isArray(message.sources) &&
                          message.sources.slice(0, 10).map((source, i) => (
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
                                // TODO: Implement source viewing
                                console.log("View source:", source);
                              }}
                            />
                          ))}
                        {Array.isArray(message.sources) &&
                          message.sources.length > 10 && (
                            <Chip
                              label={`+${message.sources.length - 10} more`}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: "0.75rem" }}
                            />
                          )}
                      </Box>
                    </Box>
                  </Collapse>
                </Box>
              )}
            </Box>
          )}
        </Box>

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
