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
// Animation and mono/revert track-color CSS live in styles/sparkle-theme.css
// (classes ssp-g, ssp-arc, ssp-mono, ssp-revert).

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
// A single path that morphs sequentially: square → circle → triangle → square.
// The morph keyframes (sss-morph) and the three shape paths live in
// styles/sparkle-theme.css. SQ (the square) is duplicated here as the static
// `d` attribute so the shape still renders under prefers-reduced-motion; keep
// it in sync with the 0%/100% frame of sss-morph.
const SQ =
  "M 12,3 C 21,3 21,3 21,12 C 21,21 21,21 12,21 C 3,21 3,21 3,12 C 3,3 3,3 12,3 Z";

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
  // forced dark arc regardless of theme (for 'dark' variant)
  dark: { trackColor: "#E7E5E4", arcColor: "#020617", trackOpacity: 1 },
  // forced white arc for dark/colored backgrounds (for 'light' variant)
  light: { trackColor: "#FFFFFF", arcColor: "#FFFFFF", trackOpacity: 0.25 },
} as const;

// mono/revert render a single SVG that adapts to the theme through CSS
// variables (the .ssp-mono / .ssp-revert rules in styles/sparkle-theme.css)
// rather than rendering a light/dark pair and toggling one with `dark:hidden`.
// The arc is primary-muted in both themes, so only the track differs — and for
// shapes (single stroke = the arc) mono and revert are visually identical.
// `--ssp-track` is set by the .ssp-mono / .ssp-revert class on the SVG:
//   mono   → border-dark   (auto-flips with the theme)
//   revert → the inverted track (opposite theme's border-dark value)

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
    // mono / revert — the single stroke is primary-muted in both themes, so one
    // SVG covers both variants without a light/dark toggle.
    return (
      <ShapesSpinnerSVG size={size} color="var(--color-primary-muted)" />
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

  // mono / revert — one SVG whose track color flips with the theme via the
  // .ssp-mono / .ssp-revert class on the SVG (see styles/sparkle-theme.css).
  return (
    <WormSpinnerSVG
      size={size}
      trackColor="var(--ssp-track)"
      arcColor="var(--color-primary-muted)"
      className={variant === "mono" ? "ssp-mono" : "ssp-revert"}
    />
  );
};

export { Spinner };
