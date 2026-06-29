import { customColors } from "@sparkle/lib/colors";
import React from "react";

const SPINNER_SIZES = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;
type SpinnerSizeType = (typeof SPINNER_SIZES)[number];

const colorVariants = Object.entries(customColors).flatMap(([color, shades]) =>
  Object.keys(shades).map((shade) => `${color}${shade}` as const)
);

const SPINNER_VARIANTS = [...colorVariants] as const;
type SpinnerVariantType = (typeof SPINNER_VARIANTS)[number];

type SpinnerVariant = "mono" | "revert" | "light" | "dark" | SpinnerVariantType;

export interface SpinnerProps {
  size?: SpinnerSizeType;
  variant?: SpinnerVariant;
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

const SPINNER_CSS = `
  @keyframes ssp-spin { to { transform: rotate(360deg); } }
  @keyframes ssp-dash {
    0%   { stroke-dasharray:  2 98; stroke-dashoffset:   0; }
    50%  { stroke-dasharray: 70 30; stroke-dashoffset: -48; }
    100% { stroke-dasharray:  2 98; stroke-dashoffset: -100; }
  }
  .ssp-g   { animation: ssp-spin 1.9s linear     infinite; transform-origin: 12px 12px; }
  .ssp-arc { animation: ssp-dash 1.9s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) {
    .ssp-g, .ssp-arc { animation: none; }
  }
`;

interface SpinnerSVGProps {
  size: SpinnerSizeType;
  trackColor: string;
  arcColor: string;
  trackOpacity?: number;
  className?: string;
}

function SpinnerSVG({
  size,
  trackColor,
  arcColor,
  trackOpacity = 1,
  className,
}: SpinnerSVGProps) {
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
      className={className}
    >
      <style>{SPINNER_CSS}</style>
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

const SCHEME = {
  // dark: near-black arc (from original spinnerDark lottie), for use on light backgrounds
  dark: { trackColor: "#E7E5E4", arcColor: "#020617", trackOpacity: 1 },
  // light: white arc on semi-transparent track, for use on dark/colored backgrounds
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

const Spinner: React.FC<SpinnerProps> = ({ size = "md", variant = "mono" }) => {
  // Custom colour variant e.g. "rose300"
  if (
    variant !== "mono" &&
    variant !== "revert" &&
    variant !== "light" &&
    variant !== "dark"
  ) {
    const hex = getCustomHex(variant);
    if (hex) {
      return (
        <SpinnerSVG
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
      <SpinnerSVG
        size={size}
        trackColor={SCHEME.light.trackColor}
        arcColor={SCHEME.light.arcColor}
        trackOpacity={SCHEME.light.trackOpacity}
      />
    );
  }

  if (variant === "dark") {
    return (
      <SpinnerSVG
        size={size}
        trackColor={SCHEME.dark.trackColor}
        arcColor={SCHEME.dark.arcColor}
      />
    );
  }

  // mono — dark arc in light mode, light arc in dark mode
  // revert — the inverse
  const lightScheme = variant === "mono" ? SCHEME.dark : SCHEME.light;
  const darkScheme = variant === "mono" ? SCHEME.light : SCHEME.dark;

  return (
    <>
      <SpinnerSVG
        size={size}
        trackColor={lightScheme.trackColor}
        arcColor={lightScheme.arcColor}
        trackOpacity={lightScheme.trackOpacity}
        className="s-block dark:s-hidden"
      />
      <SpinnerSVG
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
