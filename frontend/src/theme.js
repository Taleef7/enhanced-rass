// In frontend/src/theme.js
import { createTheme } from '@mui/material';

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#8ab4f8', // Gemini's blue for interactive elements
    },
    background: {
      default: '#131314', // Gemini's main background
      paper: '#1e1f20',   // Gemini's card/sidebar background
    },
    text: {
      primary: '#e8eaed',   // Light grey for primary text
      secondary: '#969ba1', // Dimmer grey for secondary text
    },
    divider: 'rgba(255, 255, 255, 0.12)',
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 500 },
    h6: { fontWeight: 500 },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', borderRadius: '100px' },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiAppBar: { styleOverrides: { root: { backgroundImage: 'none' } } },
  },
});