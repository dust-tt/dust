import { customColors } from "@sparkle/lib/colors";
import React from "react";

const SPINNER_SIZES = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;
type SpinnerSizeType = (typeof SPINNER_SIZES)[number];

const SPINNER_TYPES = ["worm", "shapes"] as const;
type SpinnerTypeType = (typeof SPINNER_TYPES)[number];

const colorVariants = Object.entries(customColors).flatMap(([color, shades]) =>
  Object.keys(shades).map((shade) => `${color}${shade}` as const)
);

const SPINNER_VARIANTS = [...colorVariants] as const;
type SpinnerVariantType = (typeof SPINNER_VARIANTS)[number];

type SpinnerVariant = "mono" | "revert" | "light" | "dark" | SpinnerVariantType;

export interface SpinnerProps {
  size?: SpinnerSizeType;
  variant?: SpinnerVariant;
  type?: SpinnerTypeType;
}

const pxSizeMap: Record<SpinnerSizeType, number> = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 128,
  "2xl": 192,
};

// All sizes target 2px physical stroke (strokeWidth = 2 * 24 / renderedPx).
// xl and 2xl use strokeWidth=1 so the stroke grows naturally with the SVG scale
// (1 viewBox unit = 5.3px at 128px, 8px at 192px) — appropriate for display spinners.
const strokeWidthMap: Record<SpinnerSizeType, number> = {
  xs: 3, // 2px physical @ 16px
  sm: 2.4, // 2px physical @ 20px
  md: 2, // 2px physical @ 24px
  lg: 1.5, // 2px physical @ 32px
  xl: 1, // 5.3px physical @ 128px
  "2xl": 1, // 8px physical @ 192px
};

// ─── Worm spinner ─────────────────────────────────────────────────────────────

const WORM_CSS = `
  @keyframes ssp-spin { to { transform: rotate(360deg); } }
  @keyframes ssp-dash {
    0%   { stroke-dasharray:  2 98; stroke-dashoffset:   0; }
    50%  { stroke-dasharray: 70 30; stroke-dashoffset: -48; }
    100% { stroke-dasharray:  2 98; stroke-dashoffset: -100; }
  }
  .ssp-g   { animation: ssp-spin 2.2s linear     infinite; transform-origin: 12px 12px; }
  .ssp-arc { animation: ssp-dash 2.2s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) {
    .ssp-g, .ssp-arc { animation: none; }
  }
`;

interface WormSpinnerSVGProps {
  size: SpinnerSizeType;
  trackColor: string;
  arcColor: string;
  trackOpacity?: number;
  className?: string;
}

function WormSpinnerSVG({
  size,
  trackColor,
  arcColor,
  trackOpacity = 1,
  className,
}: WormSpinnerSVGProps) {
  const px = pxSizeMap[size];
  const sw = strokeWidthMap[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
      shapeRendering="geometricPrecision"
      className={className}
    >
      <style>{WORM_CSS}</style>
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke={trackColor}
        strokeWidth={sw}
        strokeOpacity={trackOpacity}
      />
      <g className="ssp-g">
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke={arcColor}
          strokeWidth={sw}
          strokeLinecap="round"
          pathLength="100"
          className="ssp-arc"
        />
      </g>
    </svg>
  );
}

// ─── Shapes spinner ───────────────────────────────────────────────────────────
// Single path that morphs sequentially: square → circle → triangle → square.
// All three shapes are described with the same command structure (M + 4×C + Z)
// so CSS can interpolate the coordinates smoothly.
//
// Paths (viewBox 0 0 24 24, bounding circle r=9, center 12,12):
//   Square:   sharp-corner cubic beziers
//   Circle:   standard 4-bezier approximation (k = 0.5523 × 9 ≈ 4.97)
//   Triangle: equilateral (circumradius 9), top vertex at (12,3),
//             split into 4 segments with tangent-aligned control points

const SQ =
  "M 12,3 C 21,3 21,3 21,12 C 21,21 21,21 12,21 C 3,21 3,21 3,12 C 3,3 3,3 12,3 Z";
const CI =
  "M 12,3 C 16.97,3 21,7.03 21,12 C 21,16.97 16.97,21 12,21 C 7.03,21 3,16.97 3,12 C 3,7.03 7.03,3 12,3 Z";
// Triangle: 4 straight-line cubic beziers using the 1/3–2/3 rule.
// Vertices: top (12,3), bottom-right (19.79,16.5), bottom-left (4.21,16.5).
// Bottom edge is split at mid (12,16.5); the two segments are collinear so
// the join is invisible — the bottom reads as a single straight line.
const TR =
  "M 12,3 C 14.6,7.5 17.19,12 19.79,16.5 C 17.2,16.5 14.6,16.5 12,16.5 C 9.4,16.5 6.6,16.5 4.21,16.5 C 6.8,12 9.4,7.5 12,3 Z";

const SHAPES_CSS = `
  @keyframes sss-morph {
    0%,  15% { d: path('${SQ}'); animation-timing-function: ease-in-out; }
    33%, 48% { d: path('${CI}'); animation-timing-function: ease-in-out; }
    67%, 82% { d: path('${TR}'); animation-timing-function: ease-in-out; }
    100%     { d: path('${SQ}'); }
  }
  .sss-p { animation: sss-morph 2.6s linear infinite; }
  @media (prefers-reduced-motion: reduce) {
    .sss-p { animation: none; }
  }
`;

interface ShapesSpinnerSVGProps {
  size: SpinnerSizeType;
  color: string;
  className?: string;
}

function ShapesSpinnerSVG({ size, color, className }: ShapesSpinnerSVGProps) {
  const px = pxSizeMap[size];
  const sw = strokeWidthMap[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
      shapeRendering="geometricPrecision"
      className={className}
    >
      <style>{SHAPES_CSS}</style>
      <path
        d={SQ}
        stroke={color}
        strokeWidth={sw}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="sss-p"
      />
    </svg>
  );
}

// ─── Shared color scheme ──────────────────────────────────────────────────────

const SCHEME = {
  // mono on a light background: border-dark track (#DFE0E2) + primary-muted arc (#7B818D)
  monoOnLight: { trackColor: "#DFE0E2", arcColor: "#7B818D", trackOpacity: 1 },
  // mono on a dark background: border-dark-night track (#364153) + primary-muted arc (#7B818D)
  monoOnDark: { trackColor: "#364153", arcColor: "#7B818D", trackOpacity: 1 },
  // forced dark arc regardless of theme (for 'dark' variant)
  dark: { trackColor: "#E7E5E4", arcColor: "#020617", trackOpacity: 1 },
  // forced white arc for dark/colored backgrounds (for 'light' variant)
  light: { trackColor: "#FFFFFF", arcColor: "#FFFFFF", trackOpacity: 0.25 },
} as const;

function getCustomHex(variant: string): string | null {
  const match = variant.match(/^([a-zA-Z]+)(\d+)$/);
  if (!match) {
    return null;
  }
  const [, colorName, shade] = match;
  const palette = (customColors as Record<string, Record<string, string>>)[
    colorName
  ];
  return palette?.[shade] ?? null;
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

const Spinner: React.FC<SpinnerProps> = ({
  size = "md",
  variant = "mono",
  type = "worm",
}) => {
  if (type === "shapes") {
    if (
      variant !== "mono" &&
      variant !== "revert" &&
      variant !== "light" &&
      variant !== "dark"
    ) {
      const hex = getCustomHex(variant);
      if (hex) {
        return <ShapesSpinnerSVG size={size} color={hex} />;
      }
    }
    if (variant === "light") {
      return <ShapesSpinnerSVG size={size} color={SCHEME.light.arcColor} />;
    }
    if (variant === "dark") {
      return <ShapesSpinnerSVG size={size} color={SCHEME.dark.arcColor} />;
    }
    const lightColor =
      variant === "mono"
        ? SCHEME.monoOnLight.arcColor
        : SCHEME.monoOnDark.arcColor;
    const darkColor =
      variant === "mono"
        ? SCHEME.monoOnDark.arcColor
        : SCHEME.monoOnLight.arcColor;
    return (
      <>
        <ShapesSpinnerSVG
          size={size}
          color={lightColor}
          className="s-block dark:s-hidden"
        />
        <ShapesSpinnerSVG
          size={size}
          color={darkColor}
          className="s-hidden dark:s-block"
        />
      </>
    );
  }

  // type === "worm" (default)
  if (
    variant !== "mono" &&
    variant !== "revert" &&
    variant !== "light" &&
    variant !== "dark"
  ) {
    const hex = getCustomHex(variant);
    if (hex) {
      return (
        <WormSpinnerSVG
          size={size}
          trackColor={hex}
          arcColor={hex}
          trackOpacity={0.2}
        />
      );
    }
  }

  if (variant === "light") {
    return (
      <WormSpinnerSVG
        size={size}
        trackColor={SCHEME.light.trackColor}
        arcColor={SCHEME.light.arcColor}
        trackOpacity={SCHEME.light.trackOpacity}
      />
    );
  }

  if (variant === "dark") {
    return (
      <WormSpinnerSVG
        size={size}
        trackColor={SCHEME.dark.trackColor}
        arcColor={SCHEME.dark.arcColor}
      />
    );
  }

  const lightScheme =
    variant === "mono" ? SCHEME.monoOnLight : SCHEME.monoOnDark;
  const darkScheme =
    variant === "mono" ? SCHEME.monoOnDark : SCHEME.monoOnLight;

  return (
    <>
      <WormSpinnerSVG
        size={size}
        trackColor={lightScheme.trackColor}
        arcColor={lightScheme.arcColor}
        trackOpacity={lightScheme.trackOpacity}
        className="s-block dark:s-hidden"
      />
      <WormSpinnerSVG
        size={size}
        trackColor={darkScheme.trackColor}
        arcColor={darkScheme.arcColor}
        trackOpacity={darkScheme.trackOpacity}
        className="s-hidden dark:s-block"
      />
    </>
  );
};

export { Spinner };
