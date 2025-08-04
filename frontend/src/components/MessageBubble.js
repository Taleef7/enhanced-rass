import React, { useState } from 'react';
import { Box, Paper, Avatar, Tooltip, Collapse, Button, Chip, IconButton } from '@mui/material';
import { Check as CheckIcon, ContentCopy as CopyIcon, ExpandLess as ExpandLessIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { useAuth } from '../context/AuthContext';

const MessageBubble = ({ message, index }) => {
    const [copied, setCopied] = useState(false);
    const [sourcesExpanded, setSourcesExpanded] = useState(false);
    const { user } = useAuth();
    const isUser = message.sender === 'user';

    // Get user's initials for avatar
    const getInitials = (username) => {
      if (!username) return 'U';
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
              {getInitials(user?.username)}
            </Avatar>
          )}
        </Box>
      </motion.div>
    );
};

export default MessageBubble;