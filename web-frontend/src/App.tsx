/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useRef } from 'react';
import axios from 'axios';
import {
  AppBar, Box, Button, Container, CssBaseline, Drawer, IconButton,
  List, ListItem, ListItemButton, ListItemIcon, ListItemText, Paper,
  TextField, Toolbar, Typography, createTheme, ThemeProvider, CircularProgress, Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import { Menu as MenuIcon, UploadFile as UploadFileIcon, SmartToy as SmartToyIcon, AccountCircle as AccountCircleIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- THEME AND STYLING ---
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 700,
    },
  },
});

const drawerWidth = 240;

// --- INTERFACE TYPES ---
interface SourceDocument {
  text: string;
  initial_score?: number;
  rerank_score?: number;
}

interface Message {
  id: number;
  type: 'user' | 'bot';
  text: string;
  sources?: SourceDocument[];
}


// --- MAIN APP COMPONENT ---
function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // --- API HANDLERS ---
  const handleQuerySubmit = async () => {
    if (!query.trim() || isLoading) return;

    const userMessage: Message = { id: Date.now(), type: 'user', text: query };
    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setIsLoading(true);
    setError('');

    // Scroll to the bottom after the messages update
    scrollToBottom();

    const serverUrl = 'http://localhost:8080/simple-ask';
    const requestBody = { query, top_k: 5 };

    try {
      const response = await axios.post(serverUrl, requestBody);
      const botMessage: Message = {
        id: Date.now() + 1,
        type: 'bot',
        text: response.data.answer || "Sorry, I couldn't find an answer.",
        sources: response.data.source_documents || [],
      };
      setMessages(prev => [...prev, botMessage]);
    } catch (err) {
      console.error('Error fetching RASS results:', err);
      const errorMsg = axios.isAxiosError(err) ? (err.response?.data?.error || err.message) : 'An unexpected error occurred.';
      setError(`Error: ${errorMsg}`);
    } finally {
      setIsLoading(false);
      setTimeout(scrollToBottom, 100);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('files', file);

    const uploadUrl = 'http://localhost:8001/upload';

    try {
      const response = await axios.post(uploadUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const successMessage: Message = {
        id: Date.now(),
        type: 'bot',
        text: `Successfully uploaded and indexed "${file.name}".\n\n**Details:**\n- Chunks Created: ${response.data.stats.totalChunksCreated}\n- Index: ${response.data.stats.indexName}`
      }
      setMessages(prev => [...prev, successMessage]);
    } catch (err) {
      console.error('Error uploading file:', err);
      const errorMsg = axios.isAxiosError(err) ? (err.response?.data?.error || err.message) : 'An unexpected error occurred during upload.';
      setError(`Upload Error: ${errorMsg}`);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = ''; // Reset file input
      }
    }
  };


  // --- RENDER METHOD ---
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', height: '100vh' }}>
        <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
          <Toolbar>
            <IconButton color="inherit" edge="start" onClick={() => setDrawerOpen(!isDrawerOpen)} sx={{ mr: 2, display: { sm: 'none' } }}>
              <MenuIcon />
            </IconButton>
            <SmartToyIcon sx={{ mr: 2 }} />
            <Typography variant="h6" noWrap component="div">
              Enhanced RASS Engine
            </Typography>
          </Toolbar>
        </AppBar>

        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
            display: { xs: 'none', sm: 'block' }
          }}
        >
          <Toolbar />
          <Box sx={{ overflow: 'auto', p: 1 }}>
            <Button
                fullWidth
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={() => fileInputRef.current?.click()}
            >
                Upload Document
            </Button>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                accept=".pdf,.txt,.md,.json,.docx"
            />
            {/* Future: List of uploaded documents can go here */}
          </Box>
        </Drawer>

        <Box component="main" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
          <Toolbar />
          <Container maxWidth="md" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', py: 2 }}>
            <Box sx={{ flexGrow: 1, overflowY: 'auto', mb: 2 }}>
              {messages.map((msg) => (
                <Paper key={msg.id} elevation={2} sx={{
                  p: 2,
                  mb: 2,
                  bgcolor: msg.type === 'user' ? 'primary.main' : 'background.paper',
                  color: msg.type === 'user' ? 'primary.contrastText' : 'text.primary',
                  ml: msg.type === 'user' ? 'auto' : 0,
                  mr: msg.type === 'bot' ? 'auto' : 0,
                  maxWidth: '80%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1.5
                }}>
                  <Box sx={{ pt: 0.5 }}>
                   {msg.type === 'user' ? <AccountCircleIcon /> : <SmartToyIcon />}
                  </Box>
                  <Box>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                    {msg.sources && msg.sources.length > 0 && (
                      <Accordion sx={{ mt: 2, bgcolor: 'rgba(255,255,255,0.05)' }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography variant="body2">Show Sources ({msg.sources.length})</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          {msg.sources.map((source, index) => (
                            <Box key={index} sx={{ mb: 1, p: 1, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 1}}>
                               <Typography variant="caption">
                                Rerank Score: {source.rerank_score?.toFixed(4) ?? 'N/A'} | Initial Score: {source.initial_score?.toFixed(4) ?? 'N/A'}
                               </Typography>
                               <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 1, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                {source.text}
                               </Typography>
                            </Box>
                          ))}
                        </AccordionDetails>
                      </Accordion>
                    )}
                  </Box>
                </Paper>
              ))}
              {isLoading && <CircularProgress sx={{ display: 'block', mx: 'auto' }} />}
              {error && <Typography color="error">{error}</Typography>}
              <div ref={chatEndRef} />
            </Box>

            <Paper component="form" elevation={3} sx={{ p: '8px 16px', display: 'flex', alignItems: 'center' }} onSubmit={(e) => { e.preventDefault(); handleQuerySubmit(); }}>
                <TextField
                    fullWidth
                    variant="standard"
                    placeholder="Ask RASS anything..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey ? (e.preventDefault(), handleQuerySubmit()) : null }
                    disabled={isLoading}
                    multiline
                    maxRows={5}
                    InputProps={{ disableUnderline: true }}
                />
                <IconButton color="primary" type="submit" disabled={isLoading || !query.trim()}>
                    <SmartToyIcon />
                </IconButton>
            </Paper>
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;
