// In frontend/src/components/Chat.js (Refactored)
import React, { useState, useRef } from 'react';
import { Box, Typography, Tooltip, IconButton } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { streamQuery, uploadFile } from '../apiClient'; // We'll update apiClient next
import MessageList from './MessageList';
import ChatInput from './ChatInput';

function Chat({ uploadedDocuments, onDocumentUpload }) {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const abortControllerRef = useRef(null);

  const handleSendQuery = async () => {
    if (!query.trim() || isTyping) return;

    const userMessage = { sender: 'user', text: query.trim() };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setIsTyping(true);

    abortControllerRef.current = new AbortController();
    const botMessage = { sender: 'bot', text: '', sources: [] };
    setMessages(prev => [...prev, botMessage]);

    try {
      await streamQuery(
        query.trim(),
        (textChunk) => { // onTextChunk
          setMessages(prev => prev.map((msg, i) => i === prev.length - 1 ? { ...msg, text: msg.text + textChunk } : msg));
        },
        (sources) => { // onSources
          setMessages(prev => prev.map((msg, i) => i === prev.length - 1 ? { ...msg, sources } : msg));
        },
        abortControllerRef.current.signal
      );
    } catch (error) {
      if (error.name !== 'AbortError') {
        setMessages(prev => prev.map((msg, i) => i === prev.length - 1 ? { ...msg, text: `Error: ${error.message}` } : msg));
      }
    } finally {
      setIsTyping(false);
      abortControllerRef.current = null;
    }
  };

  const handleFileUpload = async (file) => {
    try {
      const response = await uploadFile(file); // Using apiClient
      onDocumentUpload({
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: new Date().toISOString()
      });
      setMessages(prev => [...prev, {
        sender: 'system',
        text: `📄 Document "${file.name}" has been uploaded.`,
      }]);
    } catch (error) {
       console.error('File upload error:', error);
       setMessages(prev => [...prev, {
        sender: 'system',
        text: `Error uploading "${file.name}": ${error.message}`,
      }]);
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'background.default' }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', backgroundColor: 'background.paper', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>RASS Assistant</Typography>
        <Tooltip title="Clear chat">
          <IconButton onClick={() => setMessages([])} size="small">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>
      <MessageList messages={messages} isTyping={isTyping} />
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