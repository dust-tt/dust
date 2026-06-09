import { cn } from "@sparkle/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";

interface AnimatedGridPatternProps {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  strokeDasharray?: number;
  numSquares?: number;
  maxOpacity?: number;
  durationSeconds?: number;
  repeatDelaySeconds?: number;
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
  durationSeconds = 1.2,
  repeatDelaySeconds = 0,
}: AnimatedGridPatternProps) {
  const shouldReduceMotion = useReducedMotion();
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
      <svg x={x} y={y} style={{ overflow: "visible" }}>
        {squares.map(({ pos: [sx, sy], id: sid, iteration }) => (
          <motion.rect
            key={`${sid}-${iteration}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: shouldReduceMotion ? 0 : maxOpacity }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : {
                    duration: durationSeconds,
                    repeat: 1,
                    delay: sid * 0.05,
                    repeatType: "reverse",
                    repeatDelay: repeatDelaySeconds,
                    ease: [0.645, 0.045, 0.355, 1],
                  }
            }
            onAnimationComplete={
              shouldReduceMotion ? undefined : () => updateSquarePosition(sid)
            }
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

export interface ImageGenerationPlaceholderProps {
  src?: string | null;
  alt?: string;
  label?: string;
  size?: number;
  fill?: boolean;
  className?: string;
}

const EASE_OUT_QUART = "cubic-bezier(0.165, 0.84, 0.44, 1)";

export function ImageGenerationPlaceholder({
  src,
  alt = "Generated image",
  label = "Creating image",
  size = 260,
  fill = false,
  className,
}: ImageGenerationPlaceholderProps) {
  const shouldReduceMotion = useReducedMotion();
  const [gridOpacity, setGridOpacity] = useState(1);
  const [imgMounted, setImgMounted] = useState(false);
  const [imgOpacity, setImgOpacity] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!src) {
      return;
    }
    setGridOpacity(0);
    const delay = shouldReduceMotion ? 0 : 120;
    const t = setTimeout(() => {
      setImgMounted(true);
      rafRef.current = requestAnimationFrame(() => setImgOpacity(1));
    }, delay);
    return () => {
      clearTimeout(t);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [src, shouldReduceMotion]);

  return (
    <div
      className={cn(
        "s-overflow-hidden s-rounded-2xl",
        "s-bg-muted-background dark:s-bg-muted-background-night",
        fill ? "s-absolute s-inset-0" : "s-relative s-shrink-0",
        className
      )}
      style={fill ? undefined : { width: size, height: size }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: gridOpacity,
          transition: shouldReduceMotion
            ? "none"
            : `opacity 220ms ${EASE_OUT_QUART}`,
          pointerEvents: gridOpacity > 0 ? "auto" : "none",
        }}
      >
        <span
          className={cn(
            "s-absolute s-top-3 s-left-3.5 s-z-10",
            "s-text-xs s-font-medium s-pointer-events-none",
            "s-text-muted-foreground dark:s-text-muted-foreground-night",
            "motion-safe:s-animate-opacity-pulse"
          )}
        >
          {label}
          <AnimatedDots />
        </span>
        <AnimatedGridPattern />
      </div>

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
            transition: shouldReduceMotion
              ? "none"
              : `opacity 350ms ${EASE_OUT_QUART}`,
          }}
        />
      )}
    </div>
  );
}
