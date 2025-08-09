// In frontend/src/theme.js
import { createTheme } from "@mui/material";

export const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#8ab4f8", // Gemini-like blue for interactive elements
      light: "#a6c7fb",
      dark: "#5e8ee0",
    },
    secondary: {
      main: "#f472b6",
      light: "#f8a8d0",
      dark: "#c13584",
    },
    background: {
      default: "#0f0f0f", // Deeper dark for contrast
      paper: "#161616", // Cards/sidebar
    },
    text: {
      primary: "#e8eaed",
      secondary: "#a3a8ae",
    },
    divider: "rgba(255, 255, 255, 0.12)",
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700, letterSpacing: -0.5 },
    h2: { fontWeight: 700, letterSpacing: -0.25 },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    body1: { lineHeight: 1.6 },
    body2: { lineHeight: 1.6 },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background:
            "radial-gradient(1200px 600px at 50% -200px, rgba(138,180,248,0.15), transparent), radial-gradient(1000px 500px at -200px 80%, rgba(244,114,182,0.08), transparent), #0f0f0f",
        },
        "::-webkit-scrollbar": { width: 10, height: 10 },
        "::-webkit-scrollbar-thumb": {
          backgroundColor: "rgba(255,255,255,0.15)",
          borderRadius: 8,
        },
        "::-webkit-scrollbar-thumb:hover": {
          backgroundColor: "rgba(255,255,255,0.25)",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          borderRadius: "100px",
          boxShadow: "0 8px 24px rgba(138,180,248,0.15)",
        },
        containedPrimary: {
          background: "linear-gradient(135deg, #8ab4f8 0%, #7aa2f7 100%)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backdropFilter: "saturate(120%) blur(6px)",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundImage: "none", backdropFilter: "blur(8px)" },
      },
    },
    MuiTextField: {
      defaultProps: { variant: "outlined" },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { borderRadius: 12 },
      },
    },
  },
});
