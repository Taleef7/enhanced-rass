// frontend/src/components/KnowledgeGraphPanel.js
// Phase F (#129): Knowledge graph visualization panel for a Knowledge Base.
// Uses react-force-graph-2d to render an interactive force-directed graph where
// nodes = documents and edges = inter-document similarity.

import React, { useCallback, useRef, useEffect, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import {
  Box,
  Typography,
  CircularProgress,
  Tooltip,
  IconButton,
  Chip,
  Paper,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import HubIcon from "@mui/icons-material/Hub";

const KnowledgeGraphPanel = ({ kbId, kbName, onClose, token }) => {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const fgRef = useRef();

  useEffect(() => {
    if (!kbId) return;
    setLoading(true);
    setError(null);

    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(`/api/knowledge-bases/${kbId}/graph?threshold=0.3`, { headers })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load graph: ${r.status}`);
        return r.json();
      })
      .then((data) => {
        // Transform edges → links (react-force-graph-2d uses source/target as link props)
        setGraphData({
          nodes: data.nodes.map((n) => ({
            ...n,
            val: Math.max(4, (n.chunkCount || 1) * 0.6),
          })),
          links: (data.edges || []).map((e) => ({
            source: e.source,
            target: e.target,
            weight: e.weight,
          })),
        });
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [kbId, token]);

  const handleNodeHover = useCallback((node) => {
    setHoveredNode(node || null);
  }, []);

  const handleZoomIn = () => fgRef.current?.zoom(fgRef.current.zoom() * 1.4, 300);
  const handleZoomOut = () => fgRef.current?.zoom(fgRef.current.zoom() / 1.4, 300);
  const handleFit = () => fgRef.current?.zoomToFit(400, 40);

  return (
    <Paper
      elevation={4}
      sx={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 420,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "rgba(15,15,35,0.97)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        zIndex: 10,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 1,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
        }}
      >
        <HubIcon sx={{ color: "#8ab4f8", fontSize: 20 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.primary" }}>
            Knowledge Graph
          </Typography>
          {kbName && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {kbName}
            </Typography>
          )}
        </Box>
        <Tooltip title="Zoom in">
          <IconButton size="small" onClick={handleZoomIn} sx={{ color: "text.secondary" }}>
            <ZoomInIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Zoom out">
          <IconButton size="small" onClick={handleZoomOut} sx={{ color: "text.secondary" }}>
            <ZoomOutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Fit to view">
          <IconButton size="small" onClick={handleFit} sx={{ color: "text.secondary" }}>
            <FitScreenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Close graph">
          <IconButton size="small" onClick={onClose} sx={{ color: "text.secondary" }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Graph canvas */}
      <Box sx={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {loading && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              zIndex: 2,
            }}
          >
            <CircularProgress size={36} />
            <Typography variant="caption" color="text.secondary">
              Computing document graph…
            </Typography>
          </Box>
        )}

        {error && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              p: 3,
              zIndex: 2,
            }}
          >
            <Typography variant="caption" color="error.main" textAlign="center">
              {error}
            </Typography>
          </Box>
        )}

        {!loading && !error && graphData.nodes.length === 0 && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              p: 3,
              gap: 1,
              zIndex: 2,
            }}
          >
            <HubIcon sx={{ fontSize: 40, color: "rgba(255,255,255,0.15)" }} />
            <Typography variant="caption" color="text.disabled" textAlign="center">
              No documents in this knowledge base yet.
              <br />
              Upload documents to see the graph.
            </Typography>
          </Box>
        )}

        {!loading && !error && graphData.nodes.length > 0 && (
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            nodeLabel={(n) => `${n.label} (${n.chunkCount} chunks)`}
            nodeColor={() => "#8ab4f8"}
            nodeRelSize={5}
            linkColor={(l) => `rgba(138,180,248,${Math.max(0.1, l.weight || 0.3)})`}
            linkWidth={(l) => Math.max(0.5, (l.weight || 0.3) * 2.5)}
            onNodeHover={handleNodeHover}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const label = node.label || "";
              const fontSize = Math.max(8, 12 / globalScale);
              const r = Math.max(4, node.val || 5);

              // Outer glow for hovered node
              if (hoveredNode && hoveredNode.id === node.id) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI, false);
                ctx.fillStyle = "rgba(138,180,248,0.25)";
                ctx.fill();
              }

              // Node circle
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
              ctx.fillStyle =
                hoveredNode && hoveredNode.id === node.id ? "#f472b6" : "#8ab4f8";
              ctx.fill();

              // Label (only when not too zoomed out)
              if (globalScale >= 0.6) {
                ctx.font = `${fontSize}px Inter, sans-serif`;
                ctx.fillStyle = "rgba(255,255,255,0.85)";
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                const shortLabel =
                  label.length > 20 ? label.slice(0, 18) + "…" : label;
                ctx.fillText(shortLabel, node.x, node.y + r + 2);
              }
            }}
            backgroundColor="transparent"
            width={420}
          />
        )}
      </Box>

      {/* Footer: hovered node info */}
      <Box
        sx={{
          px: 2,
          py: 1,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          minHeight: 44,
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexShrink: 0,
        }}
      >
        {hoveredNode ? (
          <>
            <Chip
              label={`${hoveredNode.chunkCount} chunks`}
              size="small"
              sx={{ fontSize: "0.65rem", height: 20 }}
              variant="outlined"
            />
            <Typography variant="caption" color="text.secondary" noWrap>
              {hoveredNode.label}
            </Typography>
          </>
        ) : (
          <Typography variant="caption" color="text.disabled">
            {graphData.nodes.length} documents · {graphData.links.length} similarity edges
          </Typography>
        )}
      </Box>
    </Paper>
  );
};

export default KnowledgeGraphPanel;
