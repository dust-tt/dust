import { customColors } from "@sparkle/lib/colors";
import animDark from "@sparkle/lottie/spinnerDark";
import animDarkXS from "@sparkle/lottie/spinnerDarkXS";
import animLight from "@sparkle/lottie/spinnerLight";
import animLightXS from "@sparkle/lottie/spinnerLightXS";
import Lottie from "lottie-react";
import React from "react";

const SPINNER_SIZES = ["xs", "sm", "md", "lg"] as const;
type SpinnerSizeType = (typeof SPINNER_SIZES)[number];

const SPINNER_TYPES = ["worm", "shapes", "tri"] as const;
type SpinnerTypeType = (typeof SPINNER_TYPES)[number];

const colorVariants = Object.entries(customColors).flatMap(([color, shades]) =>
  Object.keys(shades).map((shade) => `${color}${shade}` as const)
);

const SPINNER_VARIANTS = [...colorVariants] as const;
type SpinnerVariantType = (typeof SPINNER_VARIANTS)[number];

type SpinnerVariant = "mono" | "revert" | "light" | "dark" | SpinnerVariantType;

export interface SpinnerProps {
  /** Rendered size: "xs" (16px) | "sm" (20px) | "md" (24px) | "lg" (32px). Defaults to "md". */
  size?: SpinnerSizeType;
  /**
   * Color scheme: "mono" follows the current theme, "revert" inverts it, "light" forces a
   * white arc (for dark or colored backgrounds), "dark" forces a near-black arc, and a
   * palette value (e.g. "rose300") tints the spinner with that color. Defaults to "mono".
   */
  variant?: SpinnerVariant;
  /** Animation style: "worm" (default spinning arc) | "shapes" (morphing shape) | "tri" (Lottie). */
  type?: SpinnerTypeType;
}

const pxSizeMap: Record<SpinnerSizeType, number> = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
};

// All sizes target 2px physical stroke (strokeWidth = 2 * 24 / renderedPx).
// xl and 2xl use strokeWidth=1 so the stroke grows naturally with the SVG scale
// (1 viewBox unit = 5.3px at 128px, 8px at 192px) — appropriate for display spinners.
const strokeWidthMap: Record<SpinnerSizeType, number> = {
  xs: 3, // 2px physical @ 16px
  sm: 2.4, // 2px physical @ 20px
  md: 2, // 2px physical @ 24px
  lg: 1.5, // 2px physical @ 32px
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
// All three shapes share the same command structure (M + 4×C + Z) for smooth CSS interpolation.
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

function ShapesSpinnerSVG({
  size,
  color,
  className,
}: {
  size: SpinnerSizeType;
  color: string;
  className?: string;
}) {
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

// ─── Tri spinner (legacy Lottie animation) ───────────────────────────────────
// The original Dust spinner, kept available under type="tri". It renders the
// pre-CSS Lottie worm animation (spinnerLight / spinnerDark), recoloring the
// stroke for custom color variants.

type LottieColorType = [number, number, number, number];

// Convert a hex color (e.g. "#fecdd3") to the [r, g, b, a] array Lottie uses.
const hexToRgba = (hex: string): LottieColorType => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b, 1];
};

const isColorArray = (arr: unknown): arr is LottieColorType => {
  return (
    Array.isArray(arr) &&
    arr.length === 4 &&
    arr.every((n) => typeof n === "number")
  );
};

// Recursively replace color arrays within a (freshly cloned) Lottie object.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const replaceColors = (obj: any, newColor: LottieColorType): any => {
  if (Array.isArray(obj)) {
    return obj.map((item) => replaceColors(item, newColor));
  } else if (obj !== null && typeof obj === "object") {
    for (const key in obj) {
      if (isColorArray(obj[key])) {
        obj[key] = newColor;
      } else {
        obj[key] = replaceColors(obj[key], newColor);
      }
    }
  }
  return obj;
};

// xs/sm/md use the small (XS) animation; lg uses the standard one.
const lightAnimForSize = (size: SpinnerSizeType) =>
  size === "lg" ? animLight : animLightXS;
const darkAnimForSize = (size: SpinnerSizeType) =>
  size === "lg" ? animDark : animDarkXS;

function TriSpinnerLottie({
  size,
  variant,
}: {
  size: SpinnerSizeType;
  variant: SpinnerVariant;
}) {
  const px = pxSizeMap[size];
  const style = { width: `${px}px`, height: `${px}px` };

  if (
    variant !== "mono" &&
    variant !== "revert" &&
    variant !== "light" &&
    variant !== "dark"
  ) {
    const hex = getCustomHex(variant);
    if (hex) {
      // Clone before recoloring so the shared imported animation is untouched.
      const animationData = replaceColors(
        structuredClone(lightAnimForSize(size)),
        hexToRgba(hex)
      );
      return (
        <Lottie animationData={animationData} style={style} loop autoplay />
      );
    }
  }

  if (variant === "light") {
    return (
      <Lottie
        animationData={lightAnimForSize(size)}
        style={style}
        loop
        autoplay
      />
    );
  }

  if (variant === "dark") {
    return (
      <Lottie
        animationData={darkAnimForSize(size)}
        style={style}
        loop
        autoplay
      />
    );
  }

  // mono / revert: render both theme animations and toggle with dark: classes.
  // mono shows the dark-colored spinner on a light background (and vice versa);
  // revert is the opposite.
  const lightAnim = lightAnimForSize(size);
  const darkAnim = darkAnimForSize(size);
  return (
    <>
      <Lottie
        animationData={variant === "mono" ? darkAnim : lightAnim}
        className="block dark:hidden"
        style={style}
        loop
        autoplay
      />
      <Lottie
        animationData={variant === "mono" ? lightAnim : darkAnim}
        className="hidden dark:block"
        style={style}
        loop
        autoplay
      />
    </>
  );
}

// ─── Shared color scheme ──────────────────────────────────────────────────────

// Hex snapshots of the stone ramp (tokens.css) — SVG stroke attributes and the
// Lottie recoloring path need literal colors, so these must be kept in sync.
const SCHEME = {
  // mono on a light background: border-dark track (stone-150) + primary-muted arc (stone-500)
  monoOnLight: { trackColor: "#EEEEEC", arcColor: "#79716B", trackOpacity: 1 },
  // mono on a dark background: dark border-dark track (stone-700) + primary-muted arc (stone-500)
  monoOnDark: { trackColor: "#44403B", arcColor: "#79716B", trackOpacity: 1 },
  // forced dark arc regardless of theme (for 'dark' variant): stone-200 track + stone-950 arc
  dark: { trackColor: "#E7E5E4", arcColor: "#0C0A09", trackOpacity: 1 },
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

/**
 * Indicates that content is loading or an action is in progress. Use it for indeterminate
 * waits where no progress percentage is available, choosing a `size` to match the context
 * and a `variant` to suit the background — `mono` adapts to light and dark themes. For
 * loading state inside a button, use the Button's `isLoading` prop instead; for
 * brand-forward loading moments, use `SpinnerBrand`.
 *
 * @summary Indeterminate loading indicator.
 */
const Spinner: React.FC<SpinnerProps> = ({
  size = "md",
  variant = "mono",
  type = "worm",
}) => {
  if (type === "tri") {
    return <TriSpinnerLottie size={size} variant={variant} />;
  }

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
    // mono/revert: arcColor is identical in both themes (no track), single render.
    return <ShapesSpinnerSVG size={size} color={SCHEME.monoOnLight.arcColor} />;
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
        className="block dark:hidden"
      />
      <WormSpinnerSVG
        size={size}
        trackColor={darkScheme.trackColor}
        arcColor={darkScheme.arcColor}
        trackOpacity={darkScheme.trackOpacity}
        className="hidden dark:block"
      />
    </>
  );
};

export { Spinner };
