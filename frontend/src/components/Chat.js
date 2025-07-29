import React, { useState, useRef, useEffect } from 'react';
import { 
  Box, 
  Paper, 
  TextField, 
  IconButton, 
  Typography, 
  Chip, 
  Avatar, 
  Tooltip,
  Collapse,
  Button
} from '@mui/material';
import { 
  Send as SendIcon, 
  Stop as StopIcon, 
  AttachFile as AttachFileIcon,
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon,
  Check as CheckIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import axios from 'axios';

const MessageBubble = ({ message, index, isLast }) => {
  const [copied, setCopied] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const isUser = message.sender === 'user';

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
      style={{ marginBottom: '20px' }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
          alignItems: 'flex-start',
          gap: 2,
          mb: 2,
          maxWidth: '100%'
        }}
      >
        {!isUser && (
          <Avatar
            sx={{
              bgcolor: 'primary.main',
              width: 32,
              height: 32,
              fontSize: '0.875rem',
              flexShrink: 0
            }}
          >
            AI
          </Avatar>
        )}
        
        <Paper
          elevation={2}
          sx={{
            maxWidth: '85%',
            minWidth: '200px',
            p: 2,
            borderRadius: 3,
            backgroundColor: isUser ? 'primary.main' : 'background.paper',
            color: isUser ? 'white' : 'text.primary',
            position: 'relative',
            '&:hover .copy-button': {
              opacity: 1
            }
          }}
        >
          <Box sx={{ position: 'relative' }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                code({ node, inline, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  return !inline && match ? (
                    <Box
                      component="pre"
                      sx={{
                        backgroundColor: 'rgba(0,0,0,0.1)',
                        borderRadius: 1,
                        p: 1,
                        overflow: 'auto',
                        fontSize: '0.875rem',
                        maxWidth: '100%'
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
                }
              }}
            >
              {message.text}
            </ReactMarkdown>
            
            {!isUser && (
              <Tooltip title={copied ? "Copied!" : "Copy message"}>
                <IconButton
                  size="small"
                  onClick={handleCopy}
                  className="copy-button"
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    opacity: 0,
                    transition: 'opacity 0.2s',
                    color: 'text.secondary'
                  }}
                >
                  {copied ? <CheckIcon fontSize="small" /> : <CopyIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {message.sources && message.sources.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Button
                size="small"
                onClick={() => setSourcesExpanded(!sourcesExpanded)}
                endIcon={sourcesExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                sx={{ 
                  color: 'text.secondary',
                  textTransform: 'none',
                  p: 0,
                  minWidth: 'auto'
                }}
              >
                Sources ({message.sources.length})
              </Button>
              
              <Collapse in={sourcesExpanded}>
                <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {message.sources.slice(0, 10).map((source, i) => (
                      <Chip
                        key={i}
                        label={`${source.metadata?.source || 'Unknown'} (${source.initial_score?.toFixed(3) ?? 'N/A'})`}
                        size="small"
                        variant="outlined"
                        sx={{ 
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          '&:hover': {
                            backgroundColor: 'action.hover'
                          }
                        }}
                        onClick={() => {
                          // TODO: Implement source viewing
                          console.log('View source:', source);
                        }}
                      />
                    ))}
                    {message.sources.length > 10 && (
                      <Chip
                        label={`+${message.sources.length - 10} more`}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: '0.75rem' }}
                      />
                    )}
                  </Box>
                </Box>
              </Collapse>
            </Box>
          )}
        </Paper>

        {isUser && (
          <Avatar
            sx={{
              bgcolor: 'secondary.main',
              width: 32,
              height: 32,
              fontSize: '0.875rem',
              flexShrink: 0
            }}
          >
            U
          </Avatar>
        )}
      </Box>
    </motion.div>
  );
};

const TypingIndicator = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
  >
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 2,
        borderRadius: 3,
        backgroundColor: 'background.paper',
        maxWidth: '85%',
        border: 1,
        borderColor: 'divider'
      }}
    >
      <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32, fontSize: '0.875rem' }}>
        AI
      </Avatar>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.2 }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: 'primary.main'
              }}
            />
          </motion.div>
        ))}
      </Box>
    </Box>
  </motion.div>
);

const ChatInput = ({ query, setQuery, onSend, onFileUpload, isTyping, uploadedDocuments }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleFileSelect = (file) => {
    if (file) {
      onFileUpload(file);
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

function Chat({ uploadedDocuments, onDocumentUpload }) {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const abortControllerRef = useRef(null);
  const chatBoxRef = useRef(null);

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSendQuery = async () => {
    if (!query.trim() || isTyping) return;

    const userMessage = { sender: 'user', text: query.trim(), sources: [] };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setIsTyping(true);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/stream-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let sources = [];

      const botMessage = { sender: 'bot', text: '', sources: [] };
      setMessages(prev => [...prev, botMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataContent = line.substring(6);
            if (dataContent === '[DONE]') break;

            try {
              const parsed = JSON.parse(dataContent);
              const delta = parsed.choices[0]?.delta;

              if (delta?.content) {
                fullText += delta.content;
                setMessages(prev => 
                  prev.map((msg, i) => 
                    i === prev.length - 1 ? { ...msg, text: fullText } : msg
                  )
                );
              } else if (delta?.custom_meta?.citations) {
                sources = delta.custom_meta.citations;
                setMessages(prev => 
                  prev.map((msg, i) => 
                    i === prev.length - 1 ? { ...msg, sources } : msg
                  )
                );
              }
            } catch (e) {
              console.error('Error parsing stream data:', e);
            }
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        setMessages(prev => 
          prev.map((msg, i) => 
            i === prev.length - 1 ? { ...msg, text: msg.text + ' [Stopped]' } : msg
          )
        );
      } else {
        console.error('Streaming query error:', error);
        setMessages(prev => 
          prev.map((msg, i) => 
            i === prev.length - 1 ? { ...msg, text: `Error: ${error.message}` } : msg
          )
        );
      }
    } finally {
      setIsTyping(false);
      abortControllerRef.current = null;
    }
  };

  const handleFileUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post('/api/embed-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      onDocumentUpload({
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: new Date().toISOString()
      });

      // Add a system message about the uploaded document
      setMessages(prev => [...prev, {
        sender: 'system',
        text: `📄 Document "${file.name}" has been uploaded and is now available for analysis.`,
        sources: []
      }]);

    } catch (error) {
      console.error('File upload error:', error);
      // Could add error handling UI here
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'background.default'
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          RASS Assistant
        </Typography>
        <Tooltip title="Clear chat">
          <IconButton onClick={clearChat} size="small">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Chat Messages */}
      <Box
        ref={chatBoxRef}
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 2,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <AnimatePresence>
          {messages.map((message, index) => (
            <MessageBubble
              key={index}
              message={message}
              index={index}
              isLast={index === messages.length - 1}
            />
          ))}
        </AnimatePresence>
        
        {isTyping && <TypingIndicator />}
      </Box>

      {/* Input Area */}
      <ChatInput
        query={query}
        setQuery={setQuery}
        onSend={handleSendQuery}
        onFileUpload={handleFileUpload}
        isTyping={isTyping}
        uploadedDocuments={uploadedDocuments}
      />
    </Box>
  );
}

export default Chat; 