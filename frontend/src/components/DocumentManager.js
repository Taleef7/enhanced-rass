import React, { useState, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  LinearProgress,
  Alert,
  IconButton,
  Tooltip,
  Grid,
  Card,
  CardContent,
  CardActions
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Download as DownloadIcon,
  Visibility as ViewIcon
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

const DocumentManager = ({ uploadedDocuments, onDocumentUpload }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);
  const progressIntervalRef = useRef(null);

  const handleFileSelect = (selectedFile) => {
    if (selectedFile) {
      setFile(selectedFile);
      setMessage(`Selected: ${selectedFile.name}`);
      setMessageType('info');
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    handleFileSelect(selectedFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);
    setMessage('Preparing upload...');
    setMessageType('info');

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Simulate realistic progress
      progressIntervalRef.current = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 85) {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
            }
            return prev;
          }
          return prev + Math.random() * 15;
        });
      }, 300);

      const response = await axios.post('/api/embed-upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(Math.min(progress, 85)); // Cap at 85% until processing
        }
      });

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      setUploadProgress(100);
      
      setMessage(response.data.message || 'File processed successfully!');
      setMessageType('success');
      
      // Add to uploaded documents
      onDocumentUpload({
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: new Date().toISOString()
      });
      
      // Reset after success
      setTimeout(() => {
        setFile(null);
        setUploadProgress(0);
        setMessage('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }, 3000);

    } catch (error) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      setUploadProgress(0);
      console.error('Upload error:', error);
      setMessage(`Upload failed: ${error.response?.data?.error || error.message}`);
      setMessageType('error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setMessage('');
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getFileIcon = (fileName) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        return '📄';
      case 'txt':
        return '📝';
      case 'md':
        return '📋';
      case 'doc':
      case 'docx':
        return '📄';
      default:
        return '📁';
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

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
            '&:hover': {
              borderColor: 'primary.main',
              backgroundColor: 'primary.50'
            }
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            style={{ display: 'none' }}
            accept=".pdf,.txt,.md,.doc,.docx"
          />
          
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
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
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Box sx={{ mt: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Typography variant="h4">{getFileIcon(file.name)}</Typography>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {file.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatFileSize(file.size)}
                    </Typography>
                  </Box>
                  <Tooltip title="Remove file">
                    <IconButton onClick={handleRemoveFile} size="small" color="error">
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </Box>

                {/* Upload Progress */}
                {isUploading && (
                  <Box sx={{ width: '100%' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Processing...
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {Math.round(uploadProgress)}%
                      </Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={uploadProgress}
                      sx={{ height: 6, borderRadius: 3 }}
                    />
                  </Box>
                )}

                {/* Upload Button */}
                {!isUploading && (
                  <Button
                    variant="contained"
                    fullWidth
                    onClick={handleUpload}
                    disabled={!file}
                    sx={{ mt: 1 }}
                  >
                    Upload & Process
                  </Button>
                )}
              </Box>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status Message */}
        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <Alert 
                severity={messageType} 
                icon={messageType === 'success' ? <CheckIcon /> : messageType === 'error' ? <ErrorIcon /> : undefined}
                sx={{ mt: 2 }}
              >
                {message}
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>
      </Paper>

      {/* Uploaded Documents */}
      {uploadedDocuments.length > 0 && (
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Uploaded Documents ({uploadedDocuments.length})
          </Typography>
          <Grid container spacing={2}>
            {uploadedDocuments.map((doc, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                >
                  <Card sx={{ height: '100%' }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Typography variant="h5">{getFileIcon(doc.name)}</Typography>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            {doc.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatFileSize(doc.size)} • {formatDate(doc.uploadedAt)}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                    <CardActions sx={{ pt: 0 }}>
                      <Tooltip title="View document">
                        <IconButton size="small">
                          <ViewIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Download">
                        <IconButton size="small">
                          <DownloadIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove">
                        <IconButton size="small" color="error">
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </CardActions>
                  </Card>
                </motion.div>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
    </Box>
  );
};

export default DocumentManager; 