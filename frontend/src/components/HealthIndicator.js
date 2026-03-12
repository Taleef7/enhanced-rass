// frontend/src/components/HealthIndicator.js
// Phase F (#131): Service health status badge shown in the sidebar/footer.
// Polls GET /api/health every 30 seconds and displays a colour-coded badge.

import React, { useEffect, useState, useCallback } from "react";
import {
  Box,
  Tooltip,
  Typography,
  Popover,
  CircularProgress,
} from "@mui/material";

const SERVICE_LABELS = {
  postgres: "Database",
  opensearch: "Vector Index",
  redis: "Redis / Queue",
  embeddingService: "Embedding Service",
  rassEngine: "RASS Engine",
};

const StatusDot = ({ status, small = false }) => {
  const color =
    status === "ok" ? "#4ade80" : status === "degraded" ? "#fbbf24" : "#f87171";
  const size = small ? 8 : 10;
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: color,
        flexShrink: 0,
        boxShadow:
          status === "ok"
            ? `0 0 6px ${color}`
            : status === "degraded"
            ? `0 0 6px ${color}`
            : "none",
      }}
    />
  );
};

const POLL_INTERVAL_MS = 30 * 1000;

const HealthIndicator = ({ token }) => {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [anchorEl, setAnchorEl] = useState(null);

  const fetchHealth = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch("/api/health", { headers });
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const overallStatus = health?.status || (loading ? "loading" : "error");

  const handleClick = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);
  const open = Boolean(anchorEl);

  return (
    <>
      <Tooltip
        title={
          loading
            ? "Checking services…"
            : overallStatus === "ok"
            ? "All systems operational"
            : "One or more services degraded"
        }
      >
        <Box
          onClick={handleClick}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            cursor: "pointer",
            px: 1,
            py: 0.5,
            borderRadius: 1,
            "&:hover": { backgroundColor: "rgba(255,255,255,0.05)" },
          }}
        >
          {loading ? (
            <CircularProgress size={8} sx={{ color: "text.disabled" }} />
          ) : (
            <StatusDot status={overallStatus} />
          )}
          <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.65rem" }}>
            {loading
              ? "Checking…"
              : overallStatus === "ok"
              ? "All systems OK"
              : "Degraded"}
          </Typography>
        </Box>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        transformOrigin={{ vertical: "bottom", horizontal: "center" }}
        PaperProps={{
          sx: {
            backgroundColor: "#0f0f23",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 2,
            p: 2,
            minWidth: 220,
          },
        }}
      >
        <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>
          Service Health
        </Typography>
        {health?.services
          ? Object.entries(health.services).map(([key, val]) => (
              <Box
                key={key}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  mb: 0.75,
                }}
              >
                <StatusDot status={val?.status || "error"} small />
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  {SERVICE_LABELS[key] || key}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color:
                      val?.status === "ok"
                        ? "success.main"
                        : val?.status === "degraded"
                        ? "warning.main"
                        : "error.main",
                    fontWeight: 600,
                    fontSize: "0.65rem",
                  }}
                >
                  {val?.status || "unknown"}
                  {val?.clusterStatus ? ` (${val.clusterStatus})` : ""}
                </Typography>
              </Box>
            ))
          : !loading && (
              <Typography variant="caption" color="error.main">
                Unable to reach health endpoint
              </Typography>
            )}
        {health?.timestamp && (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ display: "block", mt: 1.5, fontSize: "0.6rem" }}
          >
            Last checked: {new Date(health.timestamp).toLocaleTimeString()}
          </Typography>
        )}
      </Popover>
    </>
  );
};

export default HealthIndicator;
