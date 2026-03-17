import React, { useCallback, useState } from "react";
import Joyride, { EVENTS, STATUS } from "react-joyride";
import { Box, Button, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ExploreOutlinedIcon from "@mui/icons-material/ExploreOutlined";

const TOUR_STEPS = [
  {
    target: "body",
    placement: "center",
    title: "Welcome to RASS",
    content:
      "This workspace is built for document-grounded analysis. Ask questions, inspect evidence, and keep the retrieval trail visible while you work.",
    disableBeacon: true,
  },
  {
    target: 'button[aria-label="Open conversations"]',
    placement: "bottom",
    title: "Open your conversation list",
    content:
      "Use the sidebar to create new threads, rename active conversations, and keep workstreams separated by topic.",
    disableBeacon: true,
  },
  {
    target: '[data-tour="documents-button"]',
    placement: "bottom",
    title: "Check document readiness",
    content:
      "Open the document library to confirm whether uploads are queued, processing, or ready before you rely on them in answers.",
    disableBeacon: true,
  },
  {
    target: '[data-tour="evidence-toggle"]',
    placement: "bottom",
    title: "Inspect retrieved context",
    content:
      "Open the evidence panel to review the chunks and relevance signals RASS retrieved for the current answer.",
    disableBeacon: true,
  },
  {
    target: '[data-tour="chat-input"]',
    placement: "top",
    title: "Ask for synthesis or extraction",
    content:
      "Use the composer for document-backed questions, comparisons, and follow-up requests. Press Enter to send and Shift+Enter for a new line.",
    disableBeacon: true,
  },
  {
    target: '[data-tour="upload-btn"]',
    placement: "top",
    title: "Upload source material",
    content:
      "Attach PDF, Markdown, text, or Word files here. RASS will ingest them asynchronously while you continue working.",
    disableBeacon: true,
  },
];

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
        maxWidth: 360,
        p: 3,
        borderRadius: 4,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        boxShadow: "none",
      }}
    >
      <Typography variant="overline" color="warning.main">
        Guided tour
      </Typography>
      <Typography variant="h6" sx={{ mt: 0.5 }}>
        {step.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>
        {step.content}
      </Typography>

      <Box
        sx={{
          mt: 2.5,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 1.5,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Step {index + 1} of {TOUR_STEPS.length}
        </Typography>

        <Box sx={{ display: "flex", gap: 1 }}>
          <Button {...skipProps} size="small">
            Skip
          </Button>
          {index > 0 ? (
            <Button {...backProps} size="small" variant="outlined">
              Back
            </Button>
          ) : null}
          <Button
            {...(continuous ? primaryProps : closeProps)}
            size="small"
            variant="contained"
            sx={{
              boxShadow: "none",
              "&:hover": {
                boxShadow: "none",
              },
            }}
          >
            {continuous && index < TOUR_STEPS.length - 1 ? "Next" : "Done"}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

const GuidedTour = ({ run = false, onFinish }) => {
  const theme = useTheme();
  const [tourKey, setTourKey] = useState(0);

  const handleCallback = useCallback(
    (data) => {
      if (
        [STATUS.FINISHED, STATUS.SKIPPED].includes(data.status) ||
        data.type === EVENTS.TOUR_END
      ) {
        onFinish && onFinish();
        setTourKey((previous) => previous + 1);
      }
    },
    [onFinish]
  );

  return (
    <Joyride
      key={tourKey}
      run={run}
      steps={TOUR_STEPS}
      continuous
      showProgress={false}
      showSkipButton
      disableScrolling={false}
      scrollOffset={88}
      tooltipComponent={CustomTooltip}
      callback={handleCallback}
      styles={{
        options: {
          zIndex: 1400,
          arrowColor: theme.palette.background.paper,
          overlayColor: alpha(theme.palette.common.black, 0.65),
        },
        spotlight: {
          borderRadius: 16,
        },
      }}
    />
  );
};

export const TourLaunchButton = ({ onClick }) => (
  <Button
    startIcon={<ExploreOutlinedIcon />}
    onClick={onClick}
    size="small"
    sx={{ textTransform: "none" }}
  >
    Take a tour
  </Button>
);

export default GuidedTour;
