// In frontend/src/components/DocumentPanel.js
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  CircularProgress,
  Alert,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DescriptionIcon from "@mui/icons-material/Description";
import { chatAPI } from "../api/chatApi";

const DocumentPanel = ({ open, isOpen, onClose }) => {
  const isOpenResolved = typeof open !== "undefined" ? open : isOpen;
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Note: chunkCount represents number of indexed chunks, not file size.
  // Keep a size formatter handy if we later include stored byte sizes.
  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return "Unknown size";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.max(
      0,
      Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(k))
    );
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Format date helper
  const formatDate = (dateString) => {
    if (!dateString) return "Unknown date";
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  // Load user documents when panel opens
  useEffect(() => {
    if (isOpenResolved) {
      loadUserDocuments();
    }
  }, [isOpenResolved]);

  const loadUserDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const userDocuments = await chatAPI.getUserDocuments();
      setDocuments(userDocuments);
    } catch (err) {
      console.error("Failed to load user documents:", err);
      setError("Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpenResolved}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          height: "80vh",
          backgroundColor: "background.paper",
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography variant="h6" component="span">
          Your Documents
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: "flex", flexDirection: "column" }}>
        {loading ? (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              p: 3,
            }}
          >
            <CircularProgress size={24} />
            <Typography variant="body2" sx={{ ml: 2 }}>
              Loading documents...
            </Typography>
          </Box>
        ) : error ? (
          <Box sx={{ p: 2 }}>
            <Alert severity="error">{error}</Alert>
          </Box>
        ) : (
          <>
            <Box sx={{ p: 2, pb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Documents available in RASS knowledge base ({documents.length})
              </Typography>
            </Box>
            <Box sx={{ flex: 1, overflow: "auto" }}>
              <List sx={{ pt: 0 }}>
                {documents.length > 0 ? (
                  documents.map((doc, index) => (
                    <ListItem key={index} sx={{ py: 1.5 }}>
                      <DescriptionIcon sx={{ mr: 2, color: "primary.main" }} />
                      <ListItemText
                        primary={
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 500, flex: 1 }}
                            >
                              {doc.name}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          <Box
                            component="span"
                            sx={{ mt: 0.5, display: "block" }}
                          >
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              display="block"
                            >
                              {doc.chunkCount} chunks
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              display="block"
                            >
                              Uploaded: {formatDate(doc.uploadedAt)}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                  ))
                ) : (
                  <ListItem>
                    <ListItemText
                      primary="No documents found"
                      secondary="Upload documents to get started with RASS"
                      sx={{ textAlign: "center", py: 3 }}
                    />
                  </ListItem>
                )}
              </List>
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DocumentPanel;
