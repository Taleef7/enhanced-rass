import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import GppGoodOutlinedIcon from "@mui/icons-material/GppGoodOutlined";
import ExampleQueries from "./ExampleQueries";

const WelcomeScreen = ({ onSuggestion }) => {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 5,
        py: { xs: 4, md: 6 },
      }}
    >
      {/* Editorial hero section */}
      <Box>
        {/* Overline label */}
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 1,
            border: "1px solid rgba(0,82,255,0.3)",
            backgroundColor: "rgba(0,82,255,0.06)",
            borderRadius: "20px",
            px: 1.5,
            py: 0.5,
            mb: 3,
          }}
        >
          <Box
            sx={{
              width: 6,
              height: 6,
              backgroundColor: "#0052FF",
              borderRadius: "50%",
            }}
          />
          <Typography
            sx={{
              fontSize: "0.62rem",
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "#0052FF",
            }}
          >
            Evidence-first workspace
          </Typography>
        </Box>

        {/* Main heading */}
        <Typography
          variant="h2"
          sx={{
            maxWidth: 640,
            lineHeight: 1.1,
            mb: 2.5,
            fontSize: { xs: "1.8rem", md: "2.4rem" },
          }}
        >
          Ask a question. Inspect the evidence. Keep the reasoning trail in view.
        </Typography>

        {/* Thick rule */}
        <Box sx={{ width: 48, height: 4, backgroundColor: "#0052FF", borderRadius: "2px", mb: 2.5 }} />

        <Typography
          variant="body1"
          sx={{
            maxWidth: 580,
            color: "#64748B",
            lineHeight: 1.75,
            fontSize: "0.95rem",
          }}
        >
          Enhanced RASS is built for document-backed work. Upload files, ask for
          synthesis, compare excerpts, and verify what the system retrieved
          before acting on an answer.
        </Typography>
      </Box>

      {/* Feature pillars */}
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={0}
        sx={{
          border: "1px solid #E2E8F0",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        {[
          {
            icon: <DescriptionOutlinedIcon sx={{ fontSize: 18 }} />,
            title: "Upload & track",
            body: "Monitor document readiness from QUEUED to READY.",
          },
          {
            icon: <AutoAwesomeOutlinedIcon sx={{ fontSize: 18 }} />,
            title: "Stream & inspect",
            body: "See retrieved context while answers stream in real time.",
          },
          {
            icon: <GppGoodOutlinedIcon sx={{ fontSize: 18 }} />,
            title: "Cite & validate",
            body: "Confirm every claim through citations and source excerpts.",
          },
        ].map((item, idx) => (
          <Box
            key={item.title}
            sx={{
              flex: 1,
              p: { xs: 2.5, md: 3 },
              borderRight: { md: idx < 2 ? "1px solid #E2E8F0" : "none" },
              borderBottom: { xs: idx < 2 ? "1px solid #E2E8F0" : "none", md: "none" },
            }}
          >
            <Box
              sx={{
                width: 36,
                height: 36,
                backgroundColor: "rgba(0,82,255,0.08)",
                borderRadius: "10px",
                display: "grid",
                placeItems: "center",
                mb: 1.5,
                color: "#0052FF",
              }}
            >
              {item.icon}
            </Box>
            <Typography
              variant="subtitle2"
              sx={{ mb: 0.75, fontSize: "0.7rem" }}
            >
              {item.title}
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: "#64748B", fontSize: "0.82rem", lineHeight: 1.6 }}
            >
              {item.body}
            </Typography>
          </Box>
        ))}
      </Stack>

      {/* Suggested queries */}
      <ExampleQueries onSelect={onSuggestion} />
    </Box>
  );
};

export default WelcomeScreen;
