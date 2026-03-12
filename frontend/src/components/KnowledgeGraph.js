// frontend/src/components/KnowledgeGraph.js
// Phase G #137: Knowledge graph visualization component.
//
// Renders an interactive force-directed graph of entities and relations extracted
// from a knowledge base. Users can explore connections between concepts, documents,
// people, and other entities discovered during ingestion.

import React, { useState, useEffect, useRef, useCallback } from "react";
import ForceGraph2D from "react-force-graph-2d";
import {
  Box,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  Tooltip,
  IconButton,
  TextField,
  InputAdornment,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
} from "@mui/material";
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  CenterFocusStrong as CenterIcon,
  Share as ShareIcon,
} from "@mui/icons-material";

// Node color by entity type
const TYPE_COLORS = {
  person: "#FF6B6B",
  organization: "#4ECDC4",
  drug: "#45B7D1",
  disease: "#96CEB4",
  concept: "#FFEAA7",
  location: "#A29BFE",
  other: "#DDD",
};

function nodeColor(node) {
  return TYPE_COLORS[node.type] || TYPE_COLORS.other;
}

/**
 * KnowledgeGraph — interactive force-graph for a knowledge base.
 *
 * @param {object} props
 * @param {string} props.kbId - Knowledge base ID to visualize.
 * @param {number} [props.height=600] - Graph canvas height in pixels.
 */
function KnowledgeGraph({ kbId, height = 600 }) {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedNode, setSelectedNode] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const fgRef = useRef();

  const fetchGraph = useCallback(async () => {
    if (!kbId) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch(`/api/knowledge-bases/${kbId}/graph?limit=500`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const data = await res.json();
      setGraphData({
        nodes: data.nodes || [],
        links: data.links || [],
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [kbId]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  const handleExtract = async () => {
    if (!kbId) return;
    setExtracting(true);
    try {
      const token = localStorage.getItem("accessToken");
      await fetch(`/api/knowledge-bases/${kbId}/graph/extract`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      // Wait 3s then refresh
      setTimeout(fetchGraph, 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setExtracting(false);
    }
  };

  // Filter nodes by search and type
  const filteredNodes = graphData.nodes.filter((node) => {
    const matchesSearch =
      !searchQuery ||
      node.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = selectedType === "all" || node.type === selectedType;
    return matchesSearch && matchesType;
  });

  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredLinks = graphData.links.filter(
    (l) => filteredNodeIds.has(l.source?.id || l.source) && filteredNodeIds.has(l.target?.id || l.target)
  );

  const visibleGraph = { nodes: filteredNodes, links: filteredLinks };

  const uniqueTypes = ["all", ...new Set(graphData.nodes.map((n) => n.type))];

  const handleNodeClick = (node) => {
    setSelectedNode(node);
    fgRef.current?.centerAt(node.x, node.y, 800);
    fgRef.current?.zoom(4, 800);
  };

  const handleCenter = () => {
    fgRef.current?.zoomToFit(400);
    setSelectedNode(null);
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">Failed to load knowledge graph: {error}</Alert>;
  }

  if (graphData.nodes.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="h6" gutterBottom>
          No knowledge graph yet
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Extract entities and relations from your documents to build a knowledge graph.
        </Typography>
        <Button
          variant="contained"
          onClick={handleExtract}
          disabled={extracting}
          startIcon={extracting ? <CircularProgress size={16} /> : <RefreshIcon />}
        >
          {extracting ? "Extracting..." : "Extract Knowledge Graph"}
        </Button>
      </Paper>
    );
  }

  return (
    <Paper sx={{ overflow: "hidden" }}>
      {/* Toolbar */}
      <Box sx={{ p: 2, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", borderBottom: 1, borderColor: "divider" }}>
        <TextField
          size="small"
          placeholder="Search entities..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ width: 200 }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Entity type</InputLabel>
          <Select value={selectedType} label="Entity type" onChange={(e) => setSelectedType(e.target.value)}>
            {uniqueTypes.map((t) => (
              <MenuItem key={t} value={t}>
                {t === "all" ? "All types" : t}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box sx={{ ml: "auto", display: "flex", gap: 1 }}>
          <Tooltip title="Center graph">
            <IconButton size="small" onClick={handleCenter}><CenterIcon /></IconButton>
          </Tooltip>
          <Tooltip title="Re-extract">
            <IconButton size="small" onClick={handleExtract} disabled={extracting}>
              {extracting ? <CircularProgress size={18} /> : <RefreshIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh data">
            <IconButton size="small" onClick={fetchGraph}><ShareIcon /></IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Graph canvas */}
      <Box sx={{ display: "flex" }}>
        <ForceGraph2D
          ref={fgRef}
          graphData={visibleGraph}
          height={height}
          nodeLabel={(node) => `${node.name} (${node.type})`}
          nodeColor={nodeColor}
          nodeRelSize={6}
          linkLabel={(link) => link.label || ""}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          linkColor={() => "#ccc"}
          linkWidth={1.5}
          onNodeClick={handleNodeClick}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const label = node.name;
            const fontSize = 12 / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;
            const textWidth = ctx.measureText(label).width;
            const bckgDimensions = [textWidth, fontSize].map((n) => n + fontSize * 0.2);

            // Node circle
            ctx.beginPath();
            ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI, false);
            ctx.fillStyle = nodeColor(node);
            ctx.fill();

            // Label background
            if (globalScale >= 1) {
              ctx.fillStyle = "rgba(255,255,255,0.85)";
              ctx.fillRect(
                node.x - bckgDimensions[0] / 2,
                node.y + 6,
                bckgDimensions[0],
                bckgDimensions[1]
              );
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillStyle = "#333";
              ctx.fillText(label, node.x, node.y + 6 + fontSize / 2);
            }
          }}
        />

        {/* Selected node details panel */}
        {selectedNode && (
          <Box sx={{ width: 240, p: 2, borderLeft: 1, borderColor: "divider", overflowY: "auto" }}>
            <Typography variant="subtitle2" gutterBottom>Entity Detail</Typography>
            <Divider sx={{ mb: 1 }} />
            <Typography variant="body2" fontWeight="bold">{selectedNode.name}</Typography>
            <Chip
              label={selectedNode.type}
              size="small"
              sx={{ mt: 1, mb: 1, backgroundColor: nodeColor(selectedNode), color: "#fff" }}
            />
            {selectedNode.description && (
              <Typography variant="caption" display="block">{selectedNode.description}</Typography>
            )}
            {selectedNode.documentId && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                📄 {selectedNode.documentId}
              </Typography>
            )}
          </Box>
        )}
      </Box>

      {/* Stats bar */}
      <Box sx={{ p: 1, borderTop: 1, borderColor: "divider", display: "flex", gap: 2 }}>
        <Typography variant="caption" color="text.secondary">
          {filteredNodes.length} entities · {filteredLinks.length} relations
        </Typography>
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          {Object.entries(TYPE_COLORS).filter(([t]) => t !== "other").map(([type, color]) => (
            <Chip
              key={type}
              label={type}
              size="small"
              sx={{ height: 18, fontSize: "0.65rem", backgroundColor: color, color: "#fff", cursor: "pointer" }}
              onClick={() => setSelectedType(type === selectedType ? "all" : type)}
            />
          ))}
        </Box>
      </Box>
    </Paper>
  );
}

export default KnowledgeGraph;
