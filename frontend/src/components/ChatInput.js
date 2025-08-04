import React, { useState, useRef } from 'react';
import { Box, Typography, Tooltip, IconButton, TextField, Chip, CircularProgress } from '@mui/material';
import { AttachFile as AttachFileIcon, Send as SendIcon, Stop as StopIcon } from '@mui/icons-material';
import { useChat } from '../context/ChatContext';
import { uploadFile } from '../apiClient';

const ChatInput = ({ query, setQuery, onSend, isTyping }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);
    // --- 1. THE FIX: Get addMessageToChat from the context ---
    const { activeChat, addDocumentToChat, addMessageToChat } = useChat();
    const uploadedDocuments = activeChat ? activeChat.documents : [];

    const handleKeyPress = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    };

    const handleFileSelect = async (file) => {
      if (!file || !activeChat) return;

      setIsUploading(true);
      try {
        await uploadFile(file);
        const newDoc = { name: file.name, size: file.size, type: file.type };
        addDocumentToChat(activeChat.id, newDoc);
        // --- 2. THE FIX: Use the function to add a system message ---
        addMessageToChat(activeChat.id, {
          sender: 'system',
          text: `📄 Document "${file.name}" has been successfully uploaded and is ready for use in this chat.`,
        });
      } catch (error) {
        console.error("File upload failed in ChatInput:", error);
        // --- 3. THE FIX: Also use it for error messages ---
        addMessageToChat(activeChat.id, {
          sender: 'system',
          text: `Error uploading "${file.name}": ${error.message}`,
        });
      } finally {
        setIsUploading(false);
      }
    };

    const handleDragOver = (e) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = (e) => {
      e.preventDefault();
      setIsDragging(false);
    };

    const handleDrop = (e) => {
      e.preventDefault();
      setIsDragging(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileSelect(files[0]);
      }
    };

    return (
      <Box
        sx={{
          p: 2,
          borderTop: 1,
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          position: 'relative'
        }}
      >
        {/* Uploaded Documents Indicator */}
        {uploadedDocuments.length > 0 && (
          <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="caption" color="text.secondary">
              Using documents:
            </Typography>
            {uploadedDocuments.slice(0, 3).map((doc, index) => (
              <Chip
                key={index}
                label={doc.name}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.75rem' }}
              />
            ))}
            {uploadedDocuments.length > 3 && (
              <Chip
                label={`+${uploadedDocuments.length - 3} more`}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.75rem' }}
              />
            )}
          </Box>
        )}

        {/* Input Area */}
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            alignItems: 'flex-end',
            border: isDragging ? 2 : 1,
            borderColor: isDragging ? 'primary.main' : 'divider',
            borderRadius: 3,
            p: 1,
            backgroundColor: 'background.default',
            transition: 'all 0.2s ease'
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Tooltip title="Attach file">
            <IconButton
              size="small"
              onClick={() => fileInputRef.current?.click()}
              sx={{ color: 'text.secondary' }}
              disabled={isUploading || isTyping}
            >
              {isUploading ? <CircularProgress size={24} /> : <AttachFileIcon />}
            </IconButton>
          </Tooltip>

          <input
            ref={fileInputRef}
            type="file"
            onChange={(e) => handleFileSelect(e.target.files[0])}
            style={{ display: 'none' }}
            accept=".pdf,.txt,.md,.doc,.docx"
          />

          <TextField
            fullWidth
            multiline
            maxRows={4}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask anything about your documents..."
            variant="standard"
            disabled={isTyping || isUploading}
            sx={{
              '& .MuiInput-root': {
                fontSize: '1rem',
                lineHeight: 1.5
              },
              '& .MuiInput-input': {
                padding: '8px 0'
              }
            }}
          />

          <Tooltip title={isTyping ? "Stop generation" : "Send message"}>
            <span>
              <IconButton
                onClick={isTyping ? null : onSend}
                disabled={!query.trim() || isTyping || isUploading}
                color={isTyping ? "error" : "primary"}
                sx={{
                  width: 40,
                  height: 40,
                  backgroundColor: isTyping ? 'error.main' : 'primary.main',
                  color: 'white',
                  '&:hover': {
                    backgroundColor: isTyping ? 'error.dark' : 'primary.dark'
                  },
                  '&:disabled': {
                    backgroundColor: 'action.disabledBackground',
                    color: 'action.disabled'
                  }
                }}
              >
                {isTyping ? <StopIcon /> : <SendIcon />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>
    );
};

export default ChatInput;