import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type {
  ForceGraphMethods,
  NodeObject,
} from "react-force-graph-2d";

import type {
  AgentGraphNode,
  GraphData,
  GraphNode,
  SkillGraphNode,
} from "@app/components/pages/builder/graph/types";

const AGENT_COLOR = "#60a5fa";
const SKILL_COLOR = "#a78bfa";
const LINK_COLOR = "rgba(100, 116, 139, 0.25)";
const PARTICLE_COLOR = "#60a5fa";
const BG_COLOR = "#0f172a";
const DIM_OPACITY = 0.15;

type ForceGraphNode = NodeObject<GraphNode>;

function isAgentNode(node: ForceGraphNode): node is NodeObject<AgentGraphNode> {
  return node.type === "agent";
}

function isSkillNode(node: ForceGraphNode): node is NodeObject<SkillGraphNode> {
  return node.type === "skill";
}

function getNodeRadius(node: ForceGraphNode): number {
  return 6 + Math.sqrt(node.connectionCount) * 4;
}

// Draw a hexagon path centered at (x, y) with given radius.
function drawHexagon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number
) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const hx = x + radius * Math.cos(angle);
    const hy = y + radius * Math.sin(angle);
    if (i === 0) {
      ctx.moveTo(hx, hy);
    } else {
      ctx.lineTo(hx, hy);
    }
  }
  ctx.closePath();
}

interface ForceGraphViewProps {
  graphData: GraphData;
  searchQuery: string;
  width: number;
  height: number;
}

export function ForceGraphView({
  graphData,
  searchQuery,
  width,
  height,
}: ForceGraphViewProps) {
  const fgRef =
    useRef<ForceGraphMethods<NodeObject<GraphNode>>>();
  const [hoveredNode, setHoveredNode] = useState<ForceGraphNode | null>(null);
  const imageCache = useRef(new Map<string, HTMLImageElement>());

  // Build neighbor sets for hover highlight.
  const neighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of graphData.links) {
      const sId = link.source;
      const tId = link.target;
      if (!map.has(sId)) {
        map.set(sId, new Set());
      }
      map.get(sId)!.add(tId);
      if (!map.has(tId)) {
        map.set(tId, new Set());
      }
      map.get(tId)!.add(sId);
    }
    return map;
  }, [graphData.links]);

  // Search-matched node IDs.
  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim()) {
      return null;
    }
    const q = searchQuery.toLowerCase();
    const matched = new Set<string>();
    for (const node of graphData.nodes) {
      if (node.name.toLowerCase().includes(q)) {
        matched.add(node.id);
      }
    }
    return matched;
  }, [searchQuery, graphData.nodes]);

  // Preload agent avatar images.
  useEffect(() => {
    for (const node of graphData.nodes) {
      if (node.type === "agent" && !imageCache.current.has(node.pictureUrl)) {
        const img = new Image();
        img.src = node.pictureUrl;
        imageCache.current.set(node.pictureUrl, img);
      }
    }
  }, [graphData.nodes]);

  // Configure force engine after mount.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) {
      return;
    }
    const charge = fg.d3Force("charge");
    if (charge && typeof charge["strength"] === "function") {
      charge["strength"](-200);
    }
    const link = fg.d3Force("link");
    if (link && typeof link["distance"] === "function") {
      link["distance"](80);
    }
  }, []);

  // Determine if a node should be highlighted (full opacity).
  const isNodeHighlighted = useCallback(
    (node: ForceGraphNode): boolean => {
      // If searching, only search matches are highlighted.
      if (searchMatchIds) {
        return searchMatchIds.has(node.id!.toString());
      }
      // If hovering, hovered node + neighbors are highlighted.
      if (hoveredNode) {
        const hovId = hoveredNode.id!.toString();
        const nodeId = node.id!.toString();
        if (nodeId === hovId) {
          return true;
        }
        const neighbors = neighborMap.get(hovId);
        return neighbors ? neighbors.has(nodeId) : false;
      }
      // No filter active: all highlighted.
      return true;
    },
    [searchMatchIds, hoveredNode, neighborMap]
  );

  const nodeCanvasObject = useCallback(
    (node: ForceGraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const radius = getNodeRadius(node);
      const highlighted = isNodeHighlighted(node);
      const alpha = highlighted ? 1 : DIM_OPACITY;

      ctx.save();
      ctx.globalAlpha = alpha;

      if (isAgentNode(node)) {
        // Glow effect.
        ctx.shadowColor = AGENT_COLOR;
        ctx.shadowBlur = highlighted ? 15 : 5;

        // Circle fill.
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = "#1e3a5f";
        ctx.fill();

        // Border.
        ctx.strokeStyle = AGENT_COLOR;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Avatar image clipped into circle.
        const img = imageCache.current.get(node.pictureUrl);
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, radius - 1.5, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(
            img,
            x - radius + 1.5,
            y - radius + 1.5,
            (radius - 1.5) * 2,
            (radius - 1.5) * 2
          );
          ctx.restore();
        }
      } else if (isSkillNode(node)) {
        // Glow effect.
        ctx.shadowColor = SKILL_COLOR;
        ctx.shadowBlur = highlighted ? 15 : 5;

        // Hexagon fill.
        drawHexagon(ctx, x, y, radius);
        ctx.fillStyle = "#2d1f5e";
        ctx.fill();

        // Border.
        ctx.strokeStyle = SKILL_COLOR;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Icon/emoji centered in hexagon.
        if (node.icon) {
          const fontSize = radius * 0.9;
          ctx.font = `${fontSize}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#e2e8f0";
          ctx.fillText(node.icon, x, y);
        }
      }

      // Labels: show on zoom or hover.
      const showLabel = globalScale > 1.5 || (hoveredNode && highlighted);
      if (showLabel) {
        const labelFontSize = Math.max(10 / globalScale, 3);
        ctx.font = `${labelFontSize}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = highlighted ? "#e2e8f0" : `rgba(226, 232, 240, ${DIM_OPACITY})`;
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 3;
        ctx.fillText(node.name, x, y + radius + 2);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    },
    [hoveredNode, isNodeHighlighted]
  );

  // Pointer area paint for hit detection.
  const nodePointerAreaPaint = useCallback(
    (node: ForceGraphNode, color: string, ctx: CanvasRenderingContext2D) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const radius = getNodeRadius(node);
      ctx.beginPath();
      ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    },
    []
  );

  const handleNodeHover = useCallback(
    (node: ForceGraphNode | null) => {
      setHoveredNode(node);
    },
    []
  );

  const handleNodeClick = useCallback(
    (node: ForceGraphNode) => {
      const fg = fgRef.current;
      if (fg && node.x != null && node.y != null) {
        fg.centerAt(node.x, node.y, 400);
        fg.zoom(3, 400);
      }
    },
    []
  );

  return (
    <ForceGraph2D
      ref={fgRef}
      graphData={graphData}
      width={width}
      height={height}
      backgroundColor={BG_COLOR}
      nodeCanvasObjectMode={() => "replace"}
      nodeCanvasObject={nodeCanvasObject}
      nodePointerAreaPaint={nodePointerAreaPaint}
      linkColor={() => LINK_COLOR}
      linkWidth={1}
      linkDirectionalParticles={2}
      linkDirectionalParticleSpeed={0.004}
      linkDirectionalParticleWidth={2}
      linkDirectionalParticleColor={() => PARTICLE_COLOR}
      onNodeHover={handleNodeHover}
      onNodeClick={handleNodeClick}
      warmupTicks={100}
      cooldownTicks={200}
      d3AlphaDecay={0.02}
      d3VelocityDecay={0.3}
      enableNodeDrag={true}
    />
  );
}
