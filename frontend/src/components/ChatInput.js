import React, { useState, useRef } from 'react';
import { Box, Typography, Tooltip, IconButton, TextField, Chip } from '@mui/material';
import { AttachFile as AttachFileIcon, Send as SendIcon, Stop as StopIcon } from '@mui/icons-material';
import { useChat } from '../context/ChatContext';
import { uploadFile } from '../apiClient';

const ChatInput = ({ query, setQuery, onSend, isTyping  }) => {
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef(null);
    const { activeChat, addDocumentToChat } = useChat();
    const uploadedDocuments = activeChat ? activeChat.documents : [];
  
    const handleKeyPress = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    };
  
    const handleFileSelect = async (file) => {
      if (file && activeChat) {
          try {
              await uploadFile(file); // Upload the file via API
              // On success, add document info to the current chat's state
              addDocumentToChat(activeChat.id, {
                  name: file.name,
                  size: file.size,
                  type: file.type,
              });
          } catch (error) {
              console.error("File upload failed in ChatInput:", error);
              // Optionally, show an error to the user
          }
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
            >
              <AttachFileIcon />
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
            disabled={isTyping}
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
            <IconButton
              onClick={isTyping ? null : onSend}
              disabled={!query.trim() && !isTyping}
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
          </Tooltip>
        </Box>
      </Box>
    );
};

export default ChatInput;