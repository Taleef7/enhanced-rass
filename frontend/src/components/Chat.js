  // In frontend/src/components/Chat.js (Refactored)
  import React, { useState, useRef, useEffect } from 'react';
  import { Box, Typography, Tooltip, IconButton } from '@mui/material';
  import RefreshIcon from '@mui/icons-material/Refresh';
  import { useChat } from '../context/ChatContext';
  import { streamQuery } from '../apiClient'; // We'll update apiClient next
  import MessageList from './MessageList';
  import ChatInput from './ChatInput';
  import WelcomeScreen from './WelcomeScreen';

  function Chat() {
    const [query, setQuery] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const abortControllerRef = useRef(null);

    const { activeChat, addMessageToChat, createNewChat, updateLastMessage } = useChat();

    // Effect to create a new chat if none exists on load
    useEffect(() => {
      if (!activeChat) {
        createNewChat();
      }
    }, [activeChat, createNewChat]);

    const handleSendQuery = async () => {
      if (!query.trim() || isTyping || !activeChat) return;

      addMessageToChat(activeChat.id, { sender: 'user', text: query.trim() });
      setQuery('');
      setIsTyping(true);
      abortControllerRef.current = new AbortController();
      addMessageToChat(activeChat.id, { sender: 'bot', text: '', sources: [] });

      try {
        await streamQuery(
          query.trim(),
          activeChat.documents,
          (textChunk) => { // onTextChunk
            // Use the new context function to append text to the last message
            const lastMessage = activeChat.messages[activeChat.messages.length - 1];
            updateLastMessage(activeChat.id, { text: (lastMessage.text || '') + textChunk });
          },
          (sources) => { // onSources
            // Use the new context function to add sources to the last message
            updateLastMessage(activeChat.id, { sources });
          },
          abortControllerRef.current.signal
        );
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error("Streaming error:", error);
          updateLastMessage(activeChat.id, { text: `Error: ${error.message}` });
        }
      } finally {
        setIsTyping(false);
      }
    };

    // 4. If there's no active chat yet, show a welcome screen or loading state
    if (!activeChat) {
      return <WelcomeScreen />;
    }

    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'background.default' }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', backgroundColor: 'background.paper', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>RASS Assistant</Typography>
          <Tooltip title="Clear chat (Not implemented)">
            <IconButton size="small" disabled>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
  
        {activeChat.messages.length === 0 && !isTyping ? (
          <WelcomeScreen />
        ) : (
          <MessageList messages={activeChat.messages} isTyping={isTyping} />
        )}
  
        <ChatInput
          query={query}
          setQuery={setQuery}
          onSend={handleSendQuery}
          isTyping={isTyping}
        />
      </Box>
    );  
  }

  export default Chat;