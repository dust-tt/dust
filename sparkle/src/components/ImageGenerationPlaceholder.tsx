import { motion } from "framer-motion";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";

// ─── AnimatedGridPattern ──────────────────────────────────────────────────────
// Adapted from https://magicui.design/docs/components/animated-grid-pattern

interface AnimatedGridPatternProps {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  strokeDasharray?: number;
  numSquares?: number;
  maxOpacity?: number;
  duration?: number;
  repeatDelay?: number;
}

type Square = { id: number; pos: [number, number]; iteration: number };

function AnimatedGridPattern({
  width = 22,
  height = 22,
  x = -1,
  y = -1,
  strokeDasharray = 0,
  numSquares = 30,
  maxOpacity = 0.28,
  duration = 1.2,
  repeatDelay = 0,
}: AnimatedGridPatternProps) {
  const id = useId();
  const containerRef = useRef<SVGSVGElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [squares, setSquares] = useState<Array<Square>>([]);

  const getPos = useCallback((): [number, number] => {
    return [
      Math.floor((Math.random() * dimensions.width) / width),
      Math.floor((Math.random() * dimensions.height) / height),
    ];
  }, [dimensions.height, dimensions.width, height, width]);

  const generateSquares = useCallback(
    (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        pos: getPos(),
        iteration: 0,
      })),
    [getPos]
  );

  const updateSquarePosition = useCallback(
    (squareId: number) => {
      setSquares((curr) => {
        const current = curr[squareId];
        if (!current || current.id !== squareId) {
          return curr;
        }
        const next = curr.slice();
        next[squareId] = {
          ...current,
          pos: getPos(),
          iteration: current.iteration + 1,
        };
        return next;
      });
    },
    [getPos]
  );

  useEffect(() => {
    if (dimensions.width && dimensions.height) {
      setSquares(generateSquares(numSquares));
    }
  }, [dimensions.width, dimensions.height, generateSquares, numSquares]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions((curr) => {
          const w = entry.contentRect.width;
          const h = entry.contentRect.height;
          if (curr.width === w && curr.height === h) {
            return curr;
          }
          return { width: w, height: h };
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <svg
      ref={containerRef}
      aria-hidden="true"
      style={{
        pointerEvents: "none",
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        color: "rgb(195,195,205)",
        stroke: "rgba(156,163,175,0.12)",
        fill: "none",
      }}
    >
      <defs>
        <pattern
          id={id}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          <path
            d={`M.5 ${height}V.5H${width}`}
            fill="none"
            strokeDasharray={strokeDasharray}
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
      <svg x={x} y={y} className="s-overflow-visible">
        {squares.map(({ pos: [sx, sy], id: sid, iteration }) => (
          <motion.rect
            key={`${sid}-${iteration}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: maxOpacity }}
            transition={{
              duration,
              repeat: 1,
              delay: sid * 0.1,
              repeatType: "reverse",
              repeatDelay,
              ease: [0.645, 0.045, 0.355, 1],
            }}
            onAnimationComplete={() => updateSquarePosition(sid)}
            width={width - 1}
            height={height - 1}
            x={sx * width + 1}
            y={sy * height + 1}
            fill="currentColor"
            strokeWidth="0"
          />
        ))}
      </svg>
    </svg>
  );
}

// ─── AnimatedDots ─────────────────────────────────────────────────────────────

function AnimatedDots() {
  const [n, setN] = useState(1);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const t = setInterval(() => setN((c) => (c % 3) + 1), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <span
      aria-hidden="true"
      style={{ display: "inline-block", width: "1.2ch", textAlign: "left" }}
    >
      {".".repeat(n)}
    </span>
  );
}

// ─── ImageGenerationPlaceholder ───────────────────────────────────────────────

export interface ImageGenerationPlaceholderProps {
  /**
   * Image source URL. While undefined or null, the animated generating state
   * is shown. Once set, the component crossfades into the image.
   */
  src?: string | null;
  alt?: string;
  /** Text shown while generating. Defaults to "Creating image". */
  label?: string;
  /** Size in px for both width and height. Defaults to 260. */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

const EASE_OUT_QUART = "cubic-bezier(0.165, 0.84, 0.44, 1)";

const PULSE_STYLE = `
@keyframes igp-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.7; }
}
.igp-label {
  animation: igp-pulse 2s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .igp-label { animation: none; }
}
`;

export function ImageGenerationPlaceholder({
  src,
  alt = "Generated image",
  label = "Creating image",
  size = 260,
  className,
  style,
}: ImageGenerationPlaceholderProps) {
  const [gridOpacity, setGridOpacity] = useState(1);
  const [imgMounted, setImgMounted] = useState(false);
  const [imgOpacity, setImgOpacity] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Trigger crossfade when src becomes available.
  useEffect(() => {
    if (!src) {
      return;
    }
    // Fade out grid over 220ms
    setGridOpacity(0);
    // Mount image 120ms in so both overlap briefly
    const t = setTimeout(() => {
      setImgMounted(true);
      rafRef.current = requestAnimationFrame(() => setImgOpacity(1));
    }, 120);
    return () => {
      clearTimeout(t);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [src]);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: 16,
        overflow: "hidden",
        flexShrink: 0,
        background: "#f8f8f8",
        ...style,
      }}
    >
      <style>{PULSE_STYLE}</style>

      {/* Generating state — fades out when src arrives */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: gridOpacity,
          transition: `opacity 220ms ${EASE_OUT_QUART}`,
          pointerEvents: gridOpacity > 0 ? "auto" : "none",
        }}
      >
        <span
          className="igp-label"
          style={{
            position: "absolute",
            top: 12,
            left: 14,
            fontSize: 13,
            color: "#9ca3af",
            fontWeight: 500,
            zIndex: 1,
            pointerEvents: "none",
          }}
        >
          {label}
          <AnimatedDots />
        </span>
        <AnimatedGridPattern />
      </div>

      {/* Image — fades in once src is available */}
      {imgMounted && src && (
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: imgOpacity,
            transition: `opacity 350ms ${EASE_OUT_QUART}`,
          }}
        />
      )}
    </div>
  );
}
