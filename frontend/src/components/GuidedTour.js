// frontend/src/components/GuidedTour.js
// Phase F (#131): Interactive guided tour for first-time users using react-joyride.
// Walks through chat creation, document upload, knowledge base, and settings.

import React, { useState, useCallback } from "react";
import Joyride, { STATUS, EVENTS } from "react-joyride";
import { Box, Button, Typography } from "@mui/material";
import ExploreIcon from "@mui/icons-material/Explore";

const TOUR_STEPS = [
  {
    target: "body",
    placement: "center",
    title: "Welcome to RASS! 👋",
    content:
      "RASS is your AI-powered document intelligence platform. " +
      "Let me show you around in about 60 seconds.",
    disableBeacon: true,
  },
  {
    target: '[data-tour="new-chat"]',
    placement: "right",
    title: "Start a New Chat",
    content:
      "Click here to create a new conversation. Each chat keeps its own " +
      "message history so you can work on multiple topics simultaneously.",
    disableBeacon: true,
  },
  {
    target: '[data-tour="chat-input"]',
    placement: "top",
    title: "Ask Anything",
    content:
      "Type your question here. RASS uses hybrid retrieval (semantic + keyword) " +
      "over your documents to find the most relevant context before answering.",
    disableBeacon: true,
  },
  {
    target: '[data-tour="upload-btn"]',
    placement: "top",
    title: "Upload Documents",
    content:
      "Click the paperclip to upload PDF, DOCX, TXT, or MD files. " +
      "Documents are processed asynchronously — you can keep chatting while they ingest.",
    disableBeacon: true,
  },
  {
    target: '[data-tour="my-documents"]',
    placement: "right",
    title: "Document Library",
    content:
      "View all your uploaded documents here with live status badges " +
      "(Queued → Processing → Ready). Click any document to see its ETL provenance.",
    disableBeacon: true,
  },
  {
    target: '[data-tour="knowledge-bases"]',
    placement: "right",
    title: "Knowledge Bases",
    content:
      "Organise documents into themed knowledge bases. " +
      "Share KBs with teammates and search within a specific KB when asking questions.",
    disableBeacon: true,
  },
  {
    target: "body",
    placement: "center",
    title: "You're all set! 🚀",
    content:
      "Start by uploading a document or asking a question. " +
      "Try one of the example queries below the chat input to see RASS in action.",
    disableBeacon: true,
  },
];

/**
 * Custom tooltip component for Joyride to match the app's dark theme.
 */
function CustomTooltip({
  continuous,
  index,
  step,
  backProps,
  closeProps,
  primaryProps,
  skipProps,
  tooltipProps,
}) {
  return (
    <Box
      {...tooltipProps}
      sx={{
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
        border: "1px solid rgba(138,180,248,0.3)",
        borderRadius: 2,
        p: 3,
        maxWidth: 340,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      }}
    >
      {step.title && (
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: "#8ab4f8" }}>
          {step.title}
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
        {step.content}
      </Typography>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Button
          {...skipProps}
          size="small"
          sx={{ color: "text.disabled", textTransform: "none", fontSize: "0.75rem" }}
        >
          Skip tour
        </Button>
        <Box sx={{ display: "flex", gap: 1 }}>
          {index > 0 && (
            <Button
              {...backProps}
              size="small"
              variant="outlined"
              sx={{ textTransform: "none", fontSize: "0.75rem" }}
            >
              Back
            </Button>
          )}
          <Button
            {...primaryProps}
            size="small"
            variant="contained"
            sx={{
              textTransform: "none",
              fontSize: "0.75rem",
              background: "linear-gradient(45deg, #8ab4f8 30%, #f472b6 90%)",
            }}
          >
            {continuous ? (index === TOUR_STEPS.length - 1 ? "Done" : "Next") : "Close"}
          </Button>
        </Box>
      </Box>
      <Typography
        variant="caption"
        color="text.disabled"
        sx={{ display: "block", mt: 1.5, textAlign: "center" }}
      >
        Step {index + 1} of {TOUR_STEPS.length}
      </Typography>
    </Box>
  );
}

/**
 * GuidedTour — mounts the Joyride tour.
 * Pass `run={true}` to start; `onFinish` is called when the tour completes or is skipped.
 */
const GuidedTour = ({ run = false, onFinish }) => {
  const [tourKey, setTourKey] = useState(0);

  const handleCallback = useCallback(
    (data) => {
      const { status, type } = data;
      if (
        [STATUS.FINISHED, STATUS.SKIPPED].includes(status) ||
        type === EVENTS.TOUR_END
      ) {
        if (onFinish) onFinish();
        // Reset tour so it can be re-run from the help menu
        setTourKey((k) => k + 1);
      }
    },
    [onFinish]
  );

  return (
    <Joyride
      key={tourKey}
      steps={TOUR_STEPS}
      run={run}
      continuous
      showProgress={false}
      showSkipButton
      disableScrolling={false}
      scrollOffset={80}
      tooltipComponent={CustomTooltip}
      callback={handleCallback}
      styles={{
        options: {
          zIndex: 9999,
          arrowColor: "#1a1a2e",
          overlayColor: "rgba(0,0,0,0.65)",
        },
        spotlight: {
          borderRadius: 8,
        },
      }}
    />
  );
};

/**
 * TourLaunchButton — a button that can be placed in a help menu to restart the tour.
 */
export const TourLaunchButton = ({ onClick }) => (
  <Button
    startIcon={<ExploreIcon />}
    onClick={onClick}
    size="small"
    sx={{ textTransform: "none" }}
  >
    Take a tour
  </Button>
);

export default GuidedTour;
