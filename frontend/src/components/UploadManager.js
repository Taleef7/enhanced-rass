import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Paper, Typography, Box, Button, LinearProgress, Alert, IconButton, Tooltip, Chip } from '@mui/material';
import { CloudUpload as UploadIcon, Delete as DeleteIcon, CheckCircle as CheckIcon, Error as ErrorIcon, HourglassEmpty as QueuedIcon, PlayArrow as ProcessingIcon } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { uploadFile, pollIngestionStatus } from '../apiClient';
import { useAuth } from '../context/AuthContext';

// Status → MUI chip color + label mapping
const STATUS_META = {
  queued:     { color: 'default',  label: 'Queued',     icon: <QueuedIcon fontSize="small" /> },
  waiting:    { color: 'default',  label: 'Queued',     icon: <QueuedIcon fontSize="small" /> },
  active:     { color: 'info',     label: 'Processing', icon: <ProcessingIcon fontSize="small" /> },
  completed:  { color: 'success',  label: 'Ready',      icon: <CheckIcon fontSize="small" /> },
  failed:     { color: 'error',    label: 'Failed',     icon: <ErrorIcon fontSize="small" /> },
  delayed:    { color: 'warning',  label: 'Delayed',    icon: <QueuedIcon fontSize="small" /> },
};

const PROGRESS_LABEL = {
  0:   'Queued…',
  25:  'Parsing document…',
  50:  'Chunking…',
  75:  'Embedding & indexing…',
  100: 'Complete!',
};

const getFileIcon = (fileName) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':  return '📄';
      case 'txt':  return '📝';
      case 'md':   return '📋';
      case 'doc':
      case 'docx': return '📄';
      default:     return '📁';
    }
  };

const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

const UploadManager = ({ onUploadSuccess }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [jobStatus, setJobStatus] = useState(null); // null | 'queued' | 'active' | 'completed' | 'failed'
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);
  const pollingRef = useRef(null);
  const { token } = useAuth();

  // ── Polling ───────────────────────────────────────────────────────────────

  const startPolling = useCallback((jobId, documentId, fileName, fileSize) => {
    let attempts = 0;
    const MAX_ATTEMPTS = 180; // ~6 min at 2 s intervals

    pollingRef.current = setInterval(async () => {
      attempts += 1;
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(pollingRef.current);
        setJobStatus('failed');
        setMessage('Ingestion timed out. Please retry.');
        setMessageType('error');
        setIsUploading(false);
        return;
      }

      try {
        const { data } = await pollIngestionStatus(jobId, token);
        const progress = typeof data.progress === 'number' ? data.progress : 0;
        setUploadProgress(progress);
        setJobStatus(data.status);

        const progressLabel = PROGRESS_LABEL[Math.round(progress / 25) * 25] || `Processing… (${Math.round(progress)}%)`;
        setMessage(progressLabel);

        if (data.status === 'completed') {
          clearInterval(pollingRef.current);
          setUploadProgress(100);
          setMessage('File processed successfully!');
          setMessageType('success');
          setIsUploading(false);
          if (onUploadSuccess) {
            onUploadSuccess({ name: fileName, size: fileSize, documentId, uploadedAt: new Date().toISOString() });
          }
          setTimeout(() => { setFile(null); setUploadProgress(0); setMessage(''); setJobStatus(null); if (fileInputRef.current) fileInputRef.current.value = ''; }, 3000);
        } else if (data.status === 'failed') {
          clearInterval(pollingRef.current);
          setMessage(`Ingestion failed: ${data.error || 'Unknown error'}`);
          setMessageType('error');
          setIsUploading(false);
        }
      } catch (err) {
        console.warn('[Polling] Error fetching job status:', err.message);
      }
    }, 2000);
  }, [onUploadSuccess, token]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  // ── File selection ────────────────────────────────────────────────────────

  const handleFileSelect = (selectedFile) => {
    if (selectedFile) {
      setFile(selectedFile);
      setMessage(`Selected: ${selectedFile.name}`);
      setMessageType('info');
    }
  };

  const handleFileChange = (e) => handleFileSelect(e.target.files[0]);

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);
  };

  // ── Upload ────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!file) return;
    if (pollingRef.current) clearInterval(pollingRef.current);

    setIsUploading(true);
    setUploadProgress(0);
    setJobStatus(null);
    setMessage('Uploading…');
    setMessageType('info');

    try {
      const { data } = await uploadFile(file, null, null, token);
      const firstJob = data?.jobs?.[0];
      const jobId = firstJob?.jobId;
      const documentId = data?.documentId || firstJob?.documentId;

      if (!jobId) throw new Error('No jobId returned from server.');

      setJobStatus('queued');
      setMessage('Queued for processing…');
      setMessageType('info');

      // Begin polling for job completion
      startPolling(jobId, documentId, file.name, file.size);
    } catch (error) {
      setIsUploading(false);
      setUploadProgress(0);
      setMessage(`Upload failed: ${error.response?.data?.error || error.message}`);
      setMessageType('error');
    }
  };

  const handleRemoveFile = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setFile(null);
    setMessage('');
    setUploadProgress(0);
    setJobStatus(null);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const statusMeta = jobStatus ? STATUS_META[jobStatus] : null;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
          Document Manager
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Upload and manage your documents for AI analysis
        </Typography>
      </Box>

      {/* Upload Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <UploadIcon />
          Upload New Document
        </Typography>

        {/* Drag & Drop Zone */}
        <Paper
          ref={dropZoneRef}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          sx={{
            p: 4,
            border: '2px dashed',
            borderColor: file ? 'primary.main' : 'divider',
            backgroundColor: file ? 'primary.50' : 'background.paper',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            '&:hover': { borderColor: 'primary.main', backgroundColor: 'primary.50' }
          }}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" onChange={handleFileChange} style={{ display: 'none' }} accept=".pdf,.txt,.md,.doc,.docx" />
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3 }}>
            <UploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>
              {file ? 'File Selected' : 'Drop files here or click to browse'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {file ? 'Click to change file' : 'Supports PDF, TXT, MD, DOC, DOCX'}
            </Typography>
          </motion.div>
        </Paper>

        {/* File Info */}
        <AnimatePresence>
          {file && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
              <Box sx={{ mt: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Typography variant="h4">{getFileIcon(file.name)}</Typography>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{file.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatFileSize(file.size)}</Typography>
                  </Box>
                  {statusMeta && (
                    <Chip size="small" label={statusMeta.label} color={statusMeta.color} icon={statusMeta.icon} />
                  )}
                  <Tooltip title="Remove file">
                    <IconButton onClick={handleRemoveFile} size="small" color="error" disabled={isUploading && jobStatus === 'active'}>
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </Box>

                {/* Upload Progress */}
                {isUploading && (
                  <Box sx={{ width: '100%' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="caption" color="text.secondary">{message || 'Processing…'}</Typography>
                      <Typography variant="caption" color="text.secondary">{Math.round(uploadProgress)}%</Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={uploadProgress} sx={{ height: 6, borderRadius: 3 }} />
                  </Box>
                )}

                {/* Upload Button */}
                {!isUploading && (
                  <Button variant="contained" fullWidth onClick={handleUpload} disabled={!file} sx={{ mt: 1 }}>
                    Upload &amp; Process
                  </Button>
                )}
              </Box>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status Message */}
        <AnimatePresence>
          {message && !isUploading && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
              <Alert severity={messageType} icon={messageType === 'success' ? <CheckIcon /> : messageType === 'error' ? <ErrorIcon /> : undefined} sx={{ mt: 2 }}>
                {message}
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>
      </Paper>
    </Box>
  );
};

export default UploadManager;