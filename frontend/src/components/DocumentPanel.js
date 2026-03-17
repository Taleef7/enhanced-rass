import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import { deleteDocument, fetchDocuments } from "../apiClient";
import { useAuth } from "../context/AuthContext";

const STATUS_DISPLAY = {
  READY: { label: "READY", style: { color: "#0052FF", borderColor: "#C7D2FE", backgroundColor: "#EEF2FF", labelColor: "#0052FF" } },
  PROCESSING: { label: "PROCESSING", style: { color: "#64748B", borderColor: "#CBD5E1", backgroundColor: "transparent", labelColor: "#64748B" } },
  QUEUED: { label: "QUEUED", style: { color: "#94A3B8", borderColor: "#E2E8F0", backgroundColor: "transparent", labelColor: "#94A3B8" } },
  FAILED: { label: "FAILED", style: { color: "#DC2626", borderColor: "#FECACA", backgroundColor: "#FEF2F2", labelColor: "#DC2626" } },
};

const DocumentPanel = ({ open, isOpen, onClose }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const isOpenResolved = typeof open !== "undefined" ? open : isOpen;
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { token } = useAuth();

  const formatDate = (dateString) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getDocumentName = (document) =>
    document.originalFilename || document.name || "Unnamed document";

  const loadUserDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchDocuments(1, 100, null, token);
      setDocuments(response.data.documents || []);
    } catch (err) {
      console.error("Failed to load user documents:", err);
      setError("Failed to load documents.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteDocument(deleteTarget.id, token);
      setDeleteTarget(null);
      await loadUserDocuments();
    } catch (err) {
      console.error("Failed to delete document:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (isOpenResolved) {
      loadUserDocuments();
    }
  }, [isOpenResolved, loadUserDocuments]);

  return (
    <Dialog
      open={isOpenResolved}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      fullScreen={fullScreen}
      PaperProps={{
        sx: {
          minHeight: fullScreen ? "100%" : "70vh",
          borderRadius: "16px",
          border: "1px solid #E2E8F0",
          boxShadow: "0 20px 60px rgba(15,23,42,0.12), 0 8px 24px rgba(0,82,255,0.08)",
        },
      }}
    >
      <DialogTitle
        sx={{
          px: { xs: 2.5, md: 3 },
          py: 2.5,
          borderBottom: "1px solid #E2E8F0",
          display: "flex",
          alignItems: "flex-start",
          gap: 2,
        }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography
            variant="overline"
            sx={{ display: "block", color: "#64748B", mb: 0.25 }}
          >
            Library
          </Typography>
          <Typography
            variant="h5"
            sx={{ lineHeight: 1.2, fontSize: "1.2rem" }}
          >
            Document library
          </Typography>
          <Typography
            sx={{
              mt: 0.5,
              fontSize: "0.78rem",
              color: "#64748B",
              lineHeight: 1.5,
              fontFamily: '"Inter", system-ui, sans-serif',
            }}
          >
            Review upload status and chunk coverage before asking document-backed questions.
          </Typography>
        </Box>

        <IconButton
          onClick={onClose}
          aria-label="Close document library"
          sx={{ mt: -0.5, flexShrink: 0 }}
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: { xs: 2.5, md: 3 }, py: 2.5 }}>
        {loading ? (
          <Box
            sx={{
              minHeight: 200,
              display: "grid",
              placeItems: "center",
              gap: 1.5,
            }}
          >
            <CircularProgress size={24} sx={{ color: "#0052FF" }} />
            <Typography
              sx={{
                fontSize: "0.72rem",
                fontFamily: '"JetBrains Mono", monospace',
                color: "#94A3B8",
                letterSpacing: "0.06em",
              }}
            >
              Loading documents…
            </Typography>
          </Box>
        ) : error ? (
          <Box
            sx={{
              p: 2.5,
              border: "1px solid #FECACA",
              backgroundColor: "#FEF2F2",
            }}
          >
            <Typography
              sx={{
                fontSize: "0.8rem",
                fontFamily: '"JetBrains Mono", monospace',
                color: "#DC2626",
              }}
            >
              {error}
            </Typography>
          </Box>
        ) : documents.length === 0 ? (
          <Box
            sx={{
              minHeight: 240,
              display: "grid",
              placeItems: "center",
              textAlign: "center",
              border: "1px dashed #E2E8F0",
              px: 4,
            }}
          >
            <Box>
              <DescriptionOutlinedIcon
                sx={{ fontSize: 32, color: "#E2E8F0", mb: 2 }}
              />
              <Typography
                variant="subtitle1"
                sx={{ mb: 1, fontSize: "0.95rem" }}
              >
                No documents uploaded yet
              </Typography>
              <Typography
                sx={{
                  fontSize: "0.78rem",
                  color: "#94A3B8",
                  lineHeight: 1.6,
                  fontFamily: '"JetBrains Mono", monospace',
                  maxWidth: 360,
                }}
              >
                Upload a PDF, Markdown, or text file from the composer to start retrieving evidence-backed answers.
              </Typography>
            </Box>
          </Box>
        ) : (
          <Stack spacing={0}>
            {/* Table header */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto auto",
                gap: 2,
                px: 2,
                py: 1,
                borderBottom: "1px solid #E2E8F0",
                borderTop: "1px solid #E2E8F0",
              }}
            >
              {["Document", "Chunks", "Status", ""].map((header) => (
                <Typography
                  key={header}
                  sx={{
                    fontSize: "0.6rem",
                    fontFamily: '"JetBrains Mono", monospace',
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "#64748B",
                    fontWeight: 600,
                  }}
                >
                  {header}
                </Typography>
              ))}
            </Box>

            {/* Document rows */}
            {documents.map((document) => {
              const statusInfo = STATUS_DISPLAY[document.status] || STATUS_DISPLAY.QUEUED;

              return (
                <Box
                  key={document.id || getDocumentName(document)}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto auto",
                    gap: 2,
                    px: 2,
                    py: 1.75,
                    borderBottom: "1px solid #E2E8F0",
                    alignItems: "center",
                    transition: "background-color 100ms",
                    "&:hover": {
                      backgroundColor: "rgba(0,0,0,0.02)",
                    },
                  }}
                >
                  {/* Document info */}
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1.25} alignItems="center">
                      <DescriptionOutlinedIcon
                        sx={{ fontSize: 16, color: "#64748B", flexShrink: 0 }}
                      />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          sx={{
                            fontSize: "0.82rem",
                            fontWeight: 600,
                            color: "#0F172A",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {getDocumentName(document)}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: "0.6rem",
                            fontFamily: '"JetBrains Mono", monospace',
                            color: "#94A3B8",
                            letterSpacing: "0.03em",
                            mt: 0.25,
                          }}
                        >
                          {formatDate(document.uploadedAt)}
                        </Typography>
                      </Box>
                    </Stack>
                  </Box>

                  {/* Chunk count */}
                  <Typography
                    sx={{
                      fontSize: "0.68rem",
                      fontFamily: '"JetBrains Mono", monospace',
                      color: "#64748B",
                      textAlign: "right",
                    }}
                  >
                    {document.chunkCount || 0}
                  </Typography>

                  {/* Status badge */}
                  <Box
                    sx={{
                      px: 1,
                      py: 0.3,
                      border: "1px solid",
                      borderColor: statusInfo.style.borderColor,
                      backgroundColor: statusInfo.style.backgroundColor,
                      display: "inline-flex",
                      alignItems: "center",
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: "0.58rem",
                        fontFamily: '"JetBrains Mono", monospace',
                        letterSpacing: "0.08em",
                        color: statusInfo.style.labelColor,
                        fontWeight: 500,
                      }}
                    >
                      {statusInfo.label}
                    </Typography>
                  </Box>

                  {/* Delete action */}
                  <Tooltip title="Delete document">
                    <IconButton
                      size="small"
                      onClick={() => setDeleteTarget(document)}
                      aria-label={`Delete ${getDocumentName(document)}`}
                      sx={{
                        opacity: 0,
                        ".MuiBox-root:hover &": { opacity: 1 },
                        color: "#94A3B8",
                        "&:hover": { color: "#DC2626" },
                        p: 0.5,
                      }}
                    >
                      <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              );
            })}
          </Stack>
        )}
      </DialogContent>

      {/* Delete confirmation dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => !isDeleting && setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete document</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "#64748B", lineHeight: 1.6 }}>
            Permanently remove &ldquo;{deleteTarget ? getDocumentName(deleteTarget) : ""}&rdquo; and its indexed chunks? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            onClick={() => setDeleteTarget(null)}
            variant="outlined"
            size="small"
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            size="small"
            color="error"
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};

export default DocumentPanel;
