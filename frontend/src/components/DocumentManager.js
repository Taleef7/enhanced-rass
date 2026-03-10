import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  IconButton,
  Tooltip,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Divider,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  CheckCircle as ReadyIcon,
  Error as ErrorIcon,
  HourglassEmpty as QueuedIcon,
  Sync as ProcessingIcon,
  Refresh as RefreshIcon,
  Storage as ProvenanceIcon,
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchDocuments, deleteDocument, fetchDocumentProvenance } from '../apiClient';

const STATUS_META = {
  QUEUED:     { color: 'default',  label: 'Queued',      icon: <QueuedIcon fontSize="small" /> },
  PROCESSING: { color: 'info',     label: 'Processing',  icon: <ProcessingIcon fontSize="small" /> },
  READY:      { color: 'success',  label: 'Ready',       icon: <ReadyIcon fontSize="small" /> },
  FAILED:     { color: 'error',    label: 'Failed',      icon: <ErrorIcon fontSize="small" /> },
  DELETED:    { color: 'default',  label: 'Deleted',     icon: null },
};

const getFileIcon = (fileName) => {
  if (!fileName) return '📁';
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return '📄';
  if (ext === 'txt') return '📝';
  if (ext === 'md') return '📋';
  if (ext === 'doc' || ext === 'docx') return '📄';
  return '📁';
};

const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (dateString) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const DocumentManager = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [provenanceDoc, setProvenanceDoc] = useState(null);
  const [provenance, setProvenance] = useState(null);
  const [provenanceLoading, setProvenanceLoading] = useState(false);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await fetchDocuments(1, 50);
      setDocuments(data.documents || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
    // Auto-refresh every 5 s while any document is in QUEUED/PROCESSING state
    const interval = setInterval(() => {
      setDocuments((prev) => {
        const hasActive = prev.some((d) => d.status === 'QUEUED' || d.status === 'PROCESSING');
        if (hasActive) {
          loadDocuments();
        }
        return prev;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [loadDocuments]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteDocument(deleteTarget.id);
      setDocuments((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete document.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleShowProvenance = async (doc) => {
    setProvenanceDoc(doc);
    setProvenance(null);
    setProvenanceLoading(true);
    try {
      const { data } = await fetchDocumentProvenance(doc.id);
      setProvenance(data);
    } catch (err) {
      setProvenance({ error: err.response?.data?.error || 'No provenance record available.' });
    } finally {
      setProvenanceLoading(false);
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 0.5 }}>My Documents</Typography>
          <Typography variant="body2" color="text.secondary">
            {documents.length} document{documents.length !== 1 ? 's' : ''} in your knowledge base
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={loadDocuments} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading && documents.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
          <CircularProgress />
        </Box>
      ) : documents.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', color: 'text.secondary' }}>
          <Typography variant="h6">No documents yet</Typography>
          <Typography variant="body2">Upload a document to get started.</Typography>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          <AnimatePresence>
            {documents.map((doc, index) => {
              const meta = STATUS_META[doc.status] || STATUS_META.QUEUED;
              return (
                <Grid item xs={12} sm={6} md={4} key={doc.id}>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                  >
                    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                      <CardContent sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                          <Typography variant="h5">{getFileIcon(doc.originalFilename)}</Typography>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Tooltip title={doc.originalFilename}>
                              <Typography
                                variant="subtitle2"
                                sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              >
                                {doc.originalFilename}
                              </Typography>
                            </Tooltip>
                            <Typography variant="caption" color="text.secondary" display="block">
                              {formatFileSize(doc.fileSizeBytes)} · {formatDate(doc.uploadedAt)}
                            </Typography>
                          </Box>
                        </Box>

                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                          <Chip
                            size="small"
                            label={meta.label}
                            color={meta.color}
                            icon={meta.icon}
                          />
                          {doc.chunkCount != null && (
                            <Chip size="small" variant="outlined" label={`${doc.chunkCount} chunks`} />
                          )}
                        </Box>

                        {doc.errorMessage && (
                          <Typography variant="caption" color="error" display="block" sx={{ mt: 1 }}>
                            {doc.errorMessage}
                          </Typography>
                        )}
                      </CardContent>

                      <CardActions sx={{ pt: 0, justifyContent: 'flex-end' }}>
                        {doc.status === 'READY' && (
                          <Tooltip title="View provenance">
                            <IconButton size="small" onClick={() => handleShowProvenance(doc)}>
                              <ProvenanceIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Delete document">
                          <IconButton size="small" color="error" onClick={() => setDeleteTarget(doc)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </CardActions>
                    </Card>
                  </motion.div>
                </Grid>
              );
            })}
          </AnimatePresence>
        </Grid>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => !deleteLoading && setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Document?</DialogTitle>
        <DialogContent>
          <Typography>
            This will permanently remove <strong>{deleteTarget?.originalFilename}</strong> and all its associated vectors. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={deleteLoading}>
            {deleteLoading ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Provenance Dialog */}
      <Dialog open={Boolean(provenanceDoc)} onClose={() => { setProvenanceDoc(null); setProvenance(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>ETL Provenance — {provenanceDoc?.originalFilename}</DialogTitle>
        <DialogContent>
          {provenanceLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : provenance?.error ? (
            <Alert severity="warning">{provenance.error}</Alert>
          ) : provenance ? (
            <Box sx={{ fontFamily: 'monospace', fontSize: 13 }}>
              {[
                ['Embedding Model', provenance.embeddingModel],
                ['Embedding Dim', provenance.embeddingDim],
                ['File Type', provenance.fileType],
                ['File Size', formatFileSize(provenance.fileSizeBytes)],
                ['Pages', provenance.pageCount ?? '—'],
                ['Parent Chunks', provenance.parentCount],
                ['Child Chunks', provenance.chunkCount],
                ['SHA-256', provenance.rawFileSha256?.slice(0, 16) + '…'],
              ].map(([label, value]) => (
                <Box key={label} sx={{ display: 'flex', gap: 2, py: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ width: 130, flexShrink: 0 }}>{label}</Typography>
                  <Typography variant="caption">{String(value)}</Typography>
                </Box>
              ))}
              <Divider sx={{ my: 1 }} />
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Stage timings (ms)</Typography>
              {provenance.stagesMs && Object.entries(provenance.stagesMs).map(([stage, ms]) => (
                <Box key={stage} sx={{ display: 'flex', gap: 2, py: 0.25 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ width: 130, flexShrink: 0 }}>{stage}</Typography>
                  <Typography variant="caption">{ms} ms</Typography>
                </Box>
              ))}
              <Divider sx={{ my: 1 }} />
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Chunking strategy</Typography>
              <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {JSON.stringify(provenance.chunkingStrategy, null, 2)}
              </Typography>
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setProvenanceDoc(null); setProvenance(null); }}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DocumentManager;