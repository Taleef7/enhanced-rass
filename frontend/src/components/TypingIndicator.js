import React from "react";
import { Box, Typography } from "@mui/material";
import { motion } from "framer-motion";

const TypingIndicator = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
        {/* Bot marker */}
        <Box
          sx={{
            width: 28,
            height: 28,
            border: "2px solid #0052FF",
            borderRadius: "8px",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            mt: 0.25,
          }}
        >
          <Typography
            sx={{
              fontSize: "0.6rem",
              fontFamily: '"JetBrains Mono", monospace',
              fontWeight: 700,
              letterSpacing: "0.05em",
              color: "#0052FF",
            }}
          >
            R
          </Typography>
        </Box>

        {/* Typing indicator bubble */}
        <Box
          sx={{
            px: 2,
            py: 1.5,
            border: "1px solid #E2E8F0",
            borderRadius: "12px",
            backgroundColor: "#FFFFFF",
            boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <Box sx={{ display: "flex", gap: 0.625 }}>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ scaleY: [1, 2, 1] }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.12,
                  ease: "easeInOut",
                }}
                style={{ originY: 1 }}
              >
                <Box
                  sx={{
                    width: 3,
                    height: 10,
                    backgroundColor: "#0052FF",
                    borderRadius: "2px",
                  }}
                />
              </motion.div>
            ))}
          </Box>

          <Typography
            sx={{
              fontSize: "0.62rem",
              fontFamily: '"JetBrains Mono", monospace',
              color: "#A3A3A3",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Retrieving & composing
          </Typography>
        </Box>
      </Box>
    </motion.div>
  );
};

export default TypingIndicator;
