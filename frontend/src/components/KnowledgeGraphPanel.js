import React, { useCallback, useEffect, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";

const KnowledgeGraphPanel = ({ kbId, kbName, onClose, token }) => {
  const theme = useTheme();
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const graphRef = useRef(null);

  useEffect(() => {
    if (!kbId) return;

    setLoading(true);
    setError(null);

    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`/api/knowledge-bases/${kbId}/similarity-graph?threshold=0.3`, { headers })
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load graph: ${response.status}`);
        return response.json();
      })
      .then((data) => {
        setGraphData({
          nodes: data.nodes.map((node) => ({
            ...node,
            val: Math.max(4, (node.chunkCount || 1) * 0.6),
          })),
          links: (data.edges || []).map((edge) => ({
            source: edge.source,
            target: edge.target,
            weight: edge.weight,
          })),
        });
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [kbId, token]);

  const zoomIn = () => graphRef.current?.zoom(graphRef.current.zoom() * 1.25, 250);
  const zoomOut = () =>
    graphRef.current?.zoom(graphRef.current.zoom() / 1.25, 250);
  const zoomToFit = () => graphRef.current?.zoomToFit(300, 40);
  const handleNodeHover = useCallback((node) => setHoveredNode(node || null), []);

  return (
    <Paper
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderRadius: 0,
      }}
    >
      <Box
        sx={{
          px: 2.25,
          py: 2,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 3,
              display: "grid",
              placeItems: "center",
              bgcolor: alpha(theme.palette.primary.main, 0.14),
              color: "primary.light",
            }}
          >
            <HubOutlinedIcon sx={{ fontSize: 18 }} />
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1">Knowledge graph</Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {kbName || "Document similarity view"}
            </Typography>
          </Box>

          <Tooltip title="Zoom in">
            <IconButton size="small" onClick={zoomIn}>
              <ZoomInIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom out">
            <IconButton size="small" onClick={zoomOut}>
              <ZoomOutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Fit to screen">
            <IconButton size="small" onClick={zoomToFit}>
              <FitScreenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {onClose ? (
            <Tooltip title="Close knowledge graph">
              <IconButton size="small" onClick={onClose}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null}
        </Stack>
      </Box>

      <Box sx={{ flex: 1, position: "relative" }}>
        {loading ? (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              gap: 2,
            }}
          >
            <Box sx={{ display: "grid", justifyItems: "center", gap: 2 }}>
              <CircularProgress />
              <Typography variant="body2" color="text.secondary">
                Computing document graph...
              </Typography>
            </Box>
          </Box>
        ) : null}

        {error ? (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              p: 3,
            }}
          >
            <Typography variant="body2" color="error.main" textAlign="center">
              {error}
            </Typography>
          </Box>
        ) : null}

        {!loading && !error && graphData.nodes.length === 0 ? (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              p: 3,
              textAlign: "center",
            }}
          >
            <Box>
              <HubOutlinedIcon sx={{ fontSize: 36, color: "text.disabled", mb: 1.5 }} />
              <Typography variant="subtitle2">No graph data yet</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Upload more documents to see how sources cluster and connect.
              </Typography>
            </Box>
          </Box>
        ) : null}

        {!loading && !error && graphData.nodes.length > 0 ? (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            width={420}
            backgroundColor="transparent"
            nodeLabel={(node) => `${node.label} (${node.chunkCount} chunks)`}
            nodeColor={() => theme.palette.primary.main}
            linkColor={(link) =>
              alpha(theme.palette.primary.main, Math.max(0.16, link.weight || 0.3))
            }
            linkWidth={(link) => Math.max(0.75, (link.weight || 0.3) * 2.2)}
            onNodeHover={handleNodeHover}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const radius = Math.max(4, node.val || 5);
              const hovered = hoveredNode && hoveredNode.id === node.id;
              const fontSize = Math.max(8, 12 / globalScale);
              const shortLabel =
                (node.label || "").length > 20
                  ? `${node.label.slice(0, 18)}...`
                  : node.label || "";

              if (hovered) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius + 5, 0, 2 * Math.PI, false);
                ctx.fillStyle = alpha(theme.palette.primary.main, 0.2);
                ctx.fill();
              }

              ctx.beginPath();
              ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
              ctx.fillStyle = hovered
                ? theme.palette.warning.main
                : theme.palette.primary.main;
              ctx.fill();

              if (globalScale >= 0.65) {
                ctx.font = `${fontSize}px IBM Plex Sans, sans-serif`;
                ctx.fillStyle = "rgba(244,247,251,0.88)";
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.fillText(shortLabel, node.x, node.y + radius + 3);
              }
            }}
          />
        ) : null}
      </Box>

      <Box
        sx={{
          px: 2.25,
          py: 1.5,
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        {hoveredNode ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              label={`${hoveredNode.chunkCount} chunks`}
              size="small"
              variant="outlined"
            />
            <Typography variant="caption" color="text.secondary" noWrap>
              {hoveredNode.label}
            </Typography>
          </Stack>
        ) : (
          <Typography variant="caption" color="text.secondary">
            {graphData.nodes.length} documents and {graphData.links.length} similarity edges
          </Typography>
        )}
      </Box>
    </Paper>
  );
};

export default KnowledgeGraphPanel;
