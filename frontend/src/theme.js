import { createTheme } from "@mui/material/styles";

// Minimalist Modern — Electric Blue SaaS Design System
// Accent: #0052FF → #4D7CFF gradient | Background: #FAFAFA | Text: #0F172A

export const monoTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#0052FF",
      light: "#4D7CFF",
      dark: "#0041CC",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#64748B",
      light: "#94A3B8",
      dark: "#475569",
      contrastText: "#FFFFFF",
    },
    success: {
      main: "#10B981",
      light: "#34D399",
      dark: "#059669",
      contrastText: "#FFFFFF",
    },
    warning: {
      main: "#F59E0B",
      light: "#FCD34D",
      dark: "#D97706",
      contrastText: "#FFFFFF",
    },
    error: {
      main: "#EF4444",
      light: "#F87171",
      dark: "#DC2626",
      contrastText: "#FFFFFF",
    },
    background: {
      default: "#FAFAFA",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#0F172A",
      secondary: "#64748B",
      disabled: "#94A3B8",
    },
    divider: "#E2E8F0",
    // Design token extensions
    shell: {
      canvas: "#FAFAFA",
      surface: "#FFFFFF",
      surfaceAlt: "#F1F5F9",
      raised: "#F8FAFC",
      border: "#E2E8F0",
      borderStrong: "#CBD5E1",
      focus: "rgba(0,82,255,0.12)",
      overlay: "rgba(255,255,255,0.92)",
    },
    evidence: {
      main: "#0052FF",
      soft: "rgba(0,82,255,0.06)",
      border: "#C7D2FE",
    },
  },

  shape: {
    borderRadius: 12,
  },

  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
    fontFamilyMono: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
    h1: {
      fontFamily: '"Calistoga", Georgia, serif',
      fontWeight: 400,
      letterSpacing: "-0.03em",
      lineHeight: 1.05,
    },
    h2: {
      fontFamily: '"Calistoga", Georgia, serif',
      fontWeight: 400,
      letterSpacing: "-0.025em",
      lineHeight: 1.1,
    },
    h3: {
      fontFamily: '"Inter", system-ui, sans-serif',
      fontWeight: 700,
      letterSpacing: "-0.02em",
      lineHeight: 1.2,
    },
    h4: {
      fontFamily: '"Inter", system-ui, sans-serif',
      fontWeight: 700,
      letterSpacing: "-0.015em",
      lineHeight: 1.25,
    },
    h5: {
      fontFamily: '"Inter", system-ui, sans-serif',
      fontWeight: 600,
      letterSpacing: "-0.01em",
    },
    h6: {
      fontFamily: '"Inter", system-ui, sans-serif',
      fontWeight: 600,
      letterSpacing: "-0.005em",
    },
    subtitle1: {
      fontWeight: 600,
      letterSpacing: "-0.005em",
    },
    subtitle2: {
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      fontSize: "0.7rem",
    },
    body1: {
      lineHeight: 1.7,
    },
    body2: {
      lineHeight: 1.6,
    },
    button: {
      fontFamily: '"Inter", system-ui, sans-serif',
      fontWeight: 600,
      letterSpacing: "0.01em",
      textTransform: "none",
      fontSize: "0.875rem",
    },
    caption: {
      fontFamily: '"JetBrains Mono", monospace',
      letterSpacing: "0.02em",
      fontSize: "0.68rem",
    },
    overline: {
      fontFamily: '"JetBrains Mono", monospace',
      letterSpacing: "0.12em",
      fontWeight: 500,
      fontSize: "0.65rem",
      textTransform: "uppercase",
    },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          height: "100%",
        },
        body: {
          minHeight: "100%",
          backgroundColor: "#FAFAFA",
          color: "#0F172A",
        },
        "#root": {
          minHeight: "100vh",
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid #E2E8F0",
          boxShadow: "0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)",
          borderRadius: 12,
        },
        elevation0: {
          boxShadow: "none",
        },
        elevation1: {
          boxShadow: "0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)",
        },
        elevation2: {
          boxShadow: "0 4px 6px rgba(15,23,42,0.07), 0 2px 4px rgba(15,23,42,0.04)",
        },
        elevation3: {
          boxShadow: "0 10px 15px rgba(15,23,42,0.08), 0 4px 6px rgba(0,82,255,0.06)",
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: "#FFFFFF",
          backgroundImage: "none",
          borderRight: "1px solid #E2E8F0",
          borderRadius: 0,
          boxShadow: "4px 0 24px rgba(15,23,42,0.06)",
        },
      },
    },

    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #E2E8F0",
          boxShadow: "none",
          color: "#0F172A",
        },
      },
    },

    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          letterSpacing: "0.01em",
          borderRadius: 10,
          paddingInline: 20,
          paddingTop: 9,
          paddingBottom: 9,
          fontWeight: 600,
          fontSize: "0.875rem",
          transition: "all 150ms ease",
          boxShadow: "none",
          "&:hover": {
            boxShadow: "none",
          },
        },
        containedPrimary: {
          background: "linear-gradient(135deg, #0052FF, #4D7CFF)",
          color: "#FFFFFF",
          border: "none",
          boxShadow: "0 2px 8px rgba(0,82,255,0.3)",
          "&:hover": {
            background: "linear-gradient(135deg, #0041CC, #3D6BEE)",
            boxShadow: "0 4px 14px rgba(0,82,255,0.4)",
            transform: "translateY(-1px)",
          },
          "&:active": {
            transform: "translateY(0)",
            boxShadow: "0 2px 6px rgba(0,82,255,0.3)",
          },
        },
        containedError: {
          backgroundColor: "#EF4444",
          color: "#FFFFFF",
          "&:hover": {
            backgroundColor: "#DC2626",
          },
        },
        outlined: {
          borderColor: "#E2E8F0",
          borderWidth: "1px",
          color: "#0F172A",
          "&:hover": {
            backgroundColor: "rgba(0,82,255,0.04)",
            borderColor: "#0052FF",
            color: "#0052FF",
          },
        },
        text: {
          color: "#64748B",
          "&:hover": {
            backgroundColor: "rgba(0,82,255,0.06)",
            color: "#0052FF",
          },
        },
        sizeSmall: {
          paddingInline: 14,
          paddingTop: 6,
          paddingBottom: 6,
          fontSize: "0.8rem",
        },
        sizeLarge: {
          paddingInline: 28,
          paddingTop: 12,
          paddingBottom: 12,
          fontSize: "0.95rem",
        },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          transition: "all 150ms ease",
          color: "#64748B",
          "&:hover": {
            backgroundColor: "rgba(0,82,255,0.08)",
            color: "#0052FF",
          },
          "&.Mui-focusVisible": {
            outline: "2px solid #0052FF",
            outlineOffset: 2,
          },
        },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: "#FFFFFF",
          fontFamily: '"Inter", system-ui, sans-serif',
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "#E2E8F0",
            borderWidth: "1px",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#CBD5E1",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "#0052FF",
            borderWidth: "2px",
          },
        },
        input: {
          paddingTop: 13,
          paddingBottom: 13,
        },
      },
    },

    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: "0.75rem",
          letterSpacing: "0.04em",
          color: "#64748B",
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: "0.65rem",
          letterSpacing: "0.04em",
          height: 26,
          border: "1px solid #E2E8F0",
          fontWeight: 500,
        },
        colorDefault: {
          backgroundColor: "#F8FAFC",
          color: "#64748B",
          borderColor: "#E2E8F0",
        },
        colorPrimary: {
          background: "linear-gradient(135deg, #0052FF, #4D7CFF)",
          color: "#FFFFFF",
          border: "none",
        },
        colorSuccess: {
          backgroundColor: "#ECFDF5",
          color: "#059669",
          borderColor: "#A7F3D0",
        },
        colorWarning: {
          backgroundColor: "#FFFBEB",
          color: "#D97706",
          borderColor: "#FDE68A",
        },
        colorError: {
          backgroundColor: "#FEF2F2",
          color: "#DC2626",
          borderColor: "#FECACA",
        },
        outlinedDefault: {
          backgroundColor: "transparent",
          borderColor: "#E2E8F0",
          color: "#64748B",
        },
        outlinedPrimary: {
          borderColor: "#C7D2FE",
          color: "#0052FF",
          backgroundColor: "rgba(0,82,255,0.04)",
        },
        outlinedSuccess: {
          borderColor: "#A7F3D0",
          color: "#059669",
          backgroundColor: "rgba(16,185,129,0.04)",
        },
        outlinedWarning: {
          borderColor: "#FDE68A",
          color: "#D97706",
          backgroundColor: "rgba(245,158,11,0.04)",
        },
        outlinedError: {
          borderColor: "#FECACA",
          color: "#DC2626",
          backgroundColor: "rgba(239,68,68,0.04)",
        },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          letterSpacing: "0.01em",
          fontSize: "0.85rem",
          fontFamily: '"Inter", system-ui, sans-serif',
          fontWeight: 500,
          minHeight: 44,
          borderRadius: 8,
          color: "#64748B",
          "&.Mui-selected": {
            color: "#0052FF",
            fontWeight: 600,
          },
        },
      },
    },

    MuiTabs: {
      styleOverrides: {
        indicator: {
          background: "linear-gradient(90deg, #0052FF, #4D7CFF)",
          height: 2,
          borderRadius: "2px 2px 0 0",
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "#0F172A",
          color: "#FFFFFF",
          borderRadius: 8,
          fontSize: "0.72rem",
          fontFamily: '"Inter", system-ui, sans-serif',
          letterSpacing: "0.01em",
          padding: "6px 10px",
          boxShadow: "0 4px 12px rgba(15,23,42,0.15)",
        },
        arrow: {
          color: "#0F172A",
        },
      },
    },

    MuiAccordion: {
      styleOverrides: {
        root: {
          borderRadius: "10px !important",
          boxShadow: "none",
          border: "1px solid #E2E8F0",
          "&:before": {
            display: "none",
          },
          "&:hover": {
            borderColor: "#0052FF",
          },
          "&.Mui-expanded": {
            borderColor: "#0052FF",
          },
          transition: "border-color 150ms",
        },
      },
    },

    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          "&:hover": {
            backgroundColor: "rgba(0,82,255,0.04)",
          },
        },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          backgroundColor: "#E2E8F0",
          height: 4,
        },
        bar: {
          background: "linear-gradient(90deg, #0052FF, #4D7CFF)",
          borderRadius: 4,
        },
        barColorSuccess: {
          backgroundColor: "#10B981",
        },
        barColorWarning: {
          backgroundColor: "#F59E0B",
        },
        barColorError: {
          backgroundColor: "#EF4444",
        },
      },
    },

    MuiAvatar: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          fontFamily: '"JetBrains Mono", monospace',
          fontWeight: 500,
          fontSize: "0.8rem",
          letterSpacing: "0.02em",
        },
        colorDefault: {
          backgroundColor: "#EEF2FF",
          color: "#0052FF",
          border: "1px solid #C7D2FE",
        },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 20,
          border: "1px solid #E2E8F0",
          boxShadow: "0 20px 60px rgba(15,23,42,0.12), 0 8px 24px rgba(0,82,255,0.08)",
        },
      },
    },

    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontFamily: '"Inter", system-ui, sans-serif',
          fontWeight: 700,
          letterSpacing: "-0.01em",
          fontSize: "1.15rem",
        },
      },
    },

    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          border: "1px solid #E2E8F0",
          boxShadow: "0 8px 24px rgba(15,23,42,0.1), 0 2px 8px rgba(0,82,255,0.06)",
        },
      },
    },

    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontFamily: '"Inter", system-ui, sans-serif',
          fontSize: "0.875rem",
          letterSpacing: "0",
          margin: "2px 4px",
          "&:hover": {
            backgroundColor: "rgba(0,82,255,0.06)",
          },
          "&.Mui-selected": {
            backgroundColor: "rgba(0,82,255,0.08)",
            color: "#0052FF",
            fontWeight: 600,
            "&:hover": {
              backgroundColor: "rgba(0,82,255,0.12)",
            },
          },
        },
      },
    },

    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          "&.Mui-selected": {
            backgroundColor: "rgba(0,82,255,0.08)",
            borderLeft: "3px solid #0052FF",
            "&:hover": {
              backgroundColor: "rgba(0,82,255,0.12)",
            },
          },
          "&:hover": {
            backgroundColor: "rgba(0,82,255,0.04)",
          },
        },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          fontFamily: '"Inter", system-ui, sans-serif',
        },
        standardInfo: {
          backgroundColor: "#EFF6FF",
          color: "#1D4ED8",
          border: "1px solid #BFDBFE",
          "& .MuiAlert-icon": {
            color: "#3B82F6",
          },
        },
        standardError: {
          backgroundColor: "#FEF2F2",
          color: "#DC2626",
          border: "1px solid #FECACA",
          "& .MuiAlert-icon": {
            color: "#EF4444",
          },
        },
        standardSuccess: {
          backgroundColor: "#ECFDF5",
          color: "#059669",
          border: "1px solid #A7F3D0",
          "& .MuiAlert-icon": {
            color: "#10B981",
          },
        },
        standardWarning: {
          backgroundColor: "#FFFBEB",
          color: "#D97706",
          border: "1px solid #FDE68A",
          "& .MuiAlert-icon": {
            color: "#F59E0B",
          },
        },
        filledSuccess: {
          backgroundColor: "#10B981",
          color: "#FFFFFF",
        },
        filledError: {
          backgroundColor: "#EF4444",
          color: "#FFFFFF",
        },
      },
    },

    MuiBadge: {
      styleOverrides: {
        badge: {
          background: "linear-gradient(135deg, #0052FF, #4D7CFF)",
          color: "#FFFFFF",
          borderRadius: 10,
          fontSize: "0.55rem",
          fontFamily: '"JetBrains Mono", monospace',
          minWidth: 18,
          height: 18,
          padding: "0 5px",
        },
      },
    },

    MuiCircularProgress: {
      styleOverrides: {
        colorPrimary: {
          color: "#0052FF",
        },
        colorInherit: {
          color: "inherit",
        },
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: "#E2E8F0",
        },
      },
    },

    MuiSnackbar: {
      styleOverrides: {
        root: {
          "& .MuiSnackbarContent-root": {
            borderRadius: 10,
            border: "1px solid #E2E8F0",
            backgroundColor: "#0F172A",
            color: "#FFFFFF",
            boxShadow: "0 8px 24px rgba(15,23,42,0.15)",
          },
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: "0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)",
          border: "1px solid #E2E8F0",
        },
      },
    },
  },
});

// Keep the old export name for any legacy imports
export const darkTheme = monoTheme;
