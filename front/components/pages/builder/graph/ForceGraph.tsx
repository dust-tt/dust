import type { Simulation, SimulationNodeDatum } from "d3-force";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AgentGraphNode,
  GraphData,
  GraphNode,
  SkillGraphNode,
} from "@app/components/pages/builder/graph/types";

const AGENT_COLOR = "#60a5fa";
const SKILL_COLOR = "#a78bfa";
const BG_COLOR = "#0f172a";
const DIM_OPACITY = 0.15;

type SimNode = GraphNode & SimulationNodeDatum;

interface SimLink {
  source: SimNode;
  target: SimNode;
}

function isAgentNode(
  node: SimNode
): node is AgentGraphNode & SimulationNodeDatum {
  return node.type === "agent";
}

function isSkillNode(
  node: SimNode
): node is SkillGraphNode & SimulationNodeDatum {
  return node.type === "skill";
}

function getNodeRadius(node: SimNode): number {
  return 10 + Math.sqrt(node.connectionCount) * 6;
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

function findNodeAtPoint(
  nodes: SimNode[],
  x: number,
  y: number
): SimNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const nx = node.x ?? 0;
    const ny = node.y ?? 0;
    const r = getNodeRadius(node) + 2;
    const dx = x - nx;
    const dy = y - ny;
    if (dx * dx + dy * dy <= r * r) {
      return node;
    }
  }
  return null;
}

// Compute a transform that fits all nodes in the viewport with padding.
function computeFitTransform(
  nodes: SimNode[],
  width: number,
  height: number
): { x: number; y: number; k: number } {
  if (nodes.length === 0) {
    return { x: 0, y: 0, k: 1 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const r = getNodeRadius(node) + 20;
    minX = Math.min(minX, x - r);
    minY = Math.min(minY, y - r);
    maxX = Math.max(maxX, x + r);
    maxY = Math.max(maxY, y + r);
  }

  const graphWidth = maxX - minX;
  const graphHeight = maxY - minY;

  if (graphWidth === 0 || graphHeight === 0) {
    return { x: width / 2, y: height / 2, k: 1 };
  }

  const padding = 40;
  const k = Math.min(
    (width - padding * 2) / graphWidth,
    (height - padding * 2) / graphHeight,
    2
  );
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return {
    x: width / 2 - cx * k,
    y: height / 2 - cy * k,
    k,
  };
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink>>();
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const imageCache = useRef(new Map<string, HTMLImageElement>());
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const rafRef = useRef<number>(0);
  const needsDrawRef = useRef(true);

  // Pan/zoom state.
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const dragRef = useRef<{
    node: SimNode | null;
    panning: boolean;
    startX: number;
    startY: number;
    startTransformX: number;
    startTransformY: number;
  } | null>(null);

  // Build neighbor sets for hover highlight.
  const neighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of graphData.links) {
      if (!map.has(link.source)) {
        map.set(link.source, new Set());
      }
      map.get(link.source)!.add(link.target);
      if (!map.has(link.target)) {
        map.set(link.target, new Set());
      }
      map.get(link.target)!.add(link.source);
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

  const isNodeHighlighted = useCallback(
    (node: SimNode): boolean => {
      if (searchMatchIds) {
        return searchMatchIds.has(node.id);
      }
      if (hoveredNode) {
        if (node.id === hoveredNode.id) {
          return true;
        }
        const neighbors = neighborMap.get(hoveredNode.id);
        return neighbors ? neighbors.has(node.id) : false;
      }
      return true;
    },
    [searchMatchIds, hoveredNode, neighborMap]
  );

  // Preload agent avatar images and trigger redraw when they load.
  useEffect(() => {
    for (const node of graphData.nodes) {
      if (node.type === "agent" && !imageCache.current.has(node.pictureUrl)) {
        const img = new Image();
        img.src = node.pictureUrl;
        img.onload = () => {
          needsDrawRef.current = true;
        };
        imageCache.current.set(node.pictureUrl, img);
      }
    }
  }, [graphData.nodes]);

  // Initialize simulation when graphData changes.
  useEffect(() => {
    const nodes: SimNode[] = graphData.nodes.map((n) => ({ ...n }));
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const links: SimLink[] = [];
    for (const l of graphData.links) {
      const source = nodeMap.get(l.source);
      const target = nodeMap.get(l.target);
      if (source && target) {
        links.push({ source, target });
      }
    }

    nodesRef.current = nodes;
    linksRef.current = links;

    const sim = forceSimulation<SimNode>(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(100)
      )
      .force("charge", forceManyBody<SimNode>().strength(-300))
      .force("center", forceCenter(0, 0))
      .force("collide", forceCollide<SimNode>((d) => getNodeRadius(d) + 6))
      .alphaDecay(0.02)
      .velocityDecay(0.3);

    sim.on("tick", () => {
      needsDrawRef.current = true;
    });

    // Auto-fit after simulation settles.
    sim.on("end", () => {
      transformRef.current = computeFitTransform(
        nodesRef.current,
        width,
        height
      );
      needsDrawRef.current = true;
    });

    simRef.current = sim;

    // Run warmup ticks synchronously then fit.
    sim.tick(100);
    transformRef.current = computeFitTransform(nodes, width, height);
    needsDrawRef.current = true;

    return () => {
      sim.stop();
    };
  }, [graphData, width, height]);

  // Render loop using requestAnimationFrame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const t = transformRef.current;
      const globalScale = t.k;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(t.k, t.k);

      const nodes = nodesRef.current;
      const links = linksRef.current;

      // Draw links.
      ctx.lineWidth = 1.5 / globalScale;
      for (const link of links) {
        const sx = link.source.x ?? 0;
        const sy = link.source.y ?? 0;
        const tx = link.target.x ?? 0;
        const ty = link.target.y ?? 0;

        let linkAlpha = 0.3;
        if (hoveredNode) {
          const srcId =
            typeof link.source === "object" ? link.source.id : link.source;
          const tgtId =
            typeof link.target === "object" ? link.target.id : link.target;
          const isConnected =
            srcId === hoveredNode.id || tgtId === hoveredNode.id;
          linkAlpha = isConnected ? 0.8 : 0.05;
        }
        if (searchMatchIds) {
          linkAlpha = 0.1;
        }

        ctx.strokeStyle = `rgba(100, 116, 139, ${linkAlpha})`;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }

      // Draw nodes.
      for (const node of nodes) {
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        const radius = getNodeRadius(node);
        const highlighted = isNodeHighlighted(node);
        const alpha = highlighted ? 1 : DIM_OPACITY;

        ctx.save();
        ctx.globalAlpha = alpha;

        if (isAgentNode(node)) {
          ctx.shadowColor = AGENT_COLOR;
          ctx.shadowBlur = highlighted ? 15 : 5;

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = "#1e3a5f";
          ctx.fill();

          ctx.strokeStyle = AGENT_COLOR;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.shadowBlur = 0;

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
          ctx.shadowColor = SKILL_COLOR;
          ctx.shadowBlur = highlighted ? 15 : 5;

          drawHexagon(ctx, x, y, radius);
          ctx.fillStyle = "#2d1f5e";
          ctx.fill();

          ctx.strokeStyle = SKILL_COLOR;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.shadowBlur = 0;

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
        const showLabel = globalScale > 1.2 || (hoveredNode && highlighted);
        if (showLabel) {
          const labelFontSize = Math.max(12 / globalScale, 3);
          ctx.font = `500 ${labelFontSize}px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = highlighted
            ? "#e2e8f0"
            : `rgba(226, 232, 240, ${DIM_OPACITY})`;
          ctx.shadowColor = "rgba(0,0,0,0.8)";
          ctx.shadowBlur = 4;
          ctx.fillText(node.name, x, y + radius + 4);
          ctx.shadowBlur = 0;
        }

        ctx.restore();
      }

      ctx.restore();
    };

    const loop = () => {
      if (needsDrawRef.current) {
        needsDrawRef.current = false;
        draw();
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [width, height, hoveredNode, isNodeHighlighted, searchMatchIds]);

  const requestDraw = useCallback(() => {
    needsDrawRef.current = true;
  }, []);

  // Convert screen coordinates to graph coordinates.
  const screenToGraph = useCallback((screenX: number, screenY: number) => {
    const t = transformRef.current;
    return {
      x: (screenX - t.x) / t.k,
      y: (screenY - t.y) / t.k,
    };
  }, []);

  const getCanvasPos = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return { x: 0, y: 0 };
      }
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getCanvasPos(e);
      const drag = dragRef.current;

      if (drag) {
        if (drag.node) {
          const graphPos = screenToGraph(pos.x, pos.y);
          drag.node.fx = graphPos.x;
          drag.node.fy = graphPos.y;
          simRef.current?.alpha(0.3).restart();
        } else if (drag.panning) {
          transformRef.current = {
            ...transformRef.current,
            x: drag.startTransformX + (pos.x - drag.startX),
            y: drag.startTransformY + (pos.y - drag.startY),
          };
          requestDraw();
        }
        return;
      }

      const graphPos = screenToGraph(pos.x, pos.y);
      const node = findNodeAtPoint(nodesRef.current, graphPos.x, graphPos.y);
      setHoveredNode(node);

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.style.cursor = node ? "pointer" : "grab";
      }
    },
    [getCanvasPos, screenToGraph, requestDraw]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getCanvasPos(e);
      const graphPos = screenToGraph(pos.x, pos.y);
      const node = findNodeAtPoint(nodesRef.current, graphPos.x, graphPos.y);

      if (node) {
        node.fx = node.x;
        node.fy = node.y;
        dragRef.current = {
          node,
          panning: false,
          startX: pos.x,
          startY: pos.y,
          startTransformX: transformRef.current.x,
          startTransformY: transformRef.current.y,
        };
        simRef.current?.alphaTarget(0.3).restart();
      } else {
        dragRef.current = {
          node: null,
          panning: true,
          startX: pos.x,
          startY: pos.y,
          startTransformX: transformRef.current.x,
          startTransformY: transformRef.current.y,
        };
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.style.cursor = "grabbing";
        }
      }
    },
    [getCanvasPos, screenToGraph]
  );

  const handleMouseUp = useCallback(() => {
    const drag = dragRef.current;
    if (drag?.node) {
      drag.node.fx = null;
      drag.node.fy = null;
      simRef.current?.alphaTarget(0);
    }
    dragRef.current = null;

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = "grab";
    }
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const pos = getCanvasPos(e);
      const t = transformRef.current;
      const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newK = Math.min(Math.max(t.k * scaleFactor, 0.1), 10);

      // Zoom toward the cursor.
      const newX = pos.x - ((pos.x - t.x) / t.k) * newK;
      const newY = pos.y - ((pos.y - t.y) / t.k) * newK;

      transformRef.current = { x: newX, y: newY, k: newK };
      requestDraw();
    },
    [getCanvasPos, requestDraw]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getCanvasPos(e);
      const graphPos = screenToGraph(pos.x, pos.y);
      const node = findNodeAtPoint(nodesRef.current, graphPos.x, graphPos.y);
      if (node && node.x != null && node.y != null) {
        const newK = 3;
        const newX = width / 2 - node.x * newK;
        const newY = height / 2 - node.y * newK;
        transformRef.current = { x: newX, y: newY, k: newK };
        requestDraw();
      }
    },
    [getCanvasPos, screenToGraph, width, height, requestDraw]
  );

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full"
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      onWheel={handleWheel}
    />
  );
}
