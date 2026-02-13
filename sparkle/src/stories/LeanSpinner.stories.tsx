import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Spinner } from "../index_with_tw_base";

// ============================================================================
// Shared constants
//
// spinnerDarkXS is a single shape that morphs: Circle → Triangle → Square → Circle
// over 112 frames at 50fps = 2.24s, with a subtle vertical bounce and
// opacity changes.
// ============================================================================

const SM_SIZE = 20;
const DARK_COLOR = "#0F172A";

// Duration matches 112 frames @ 50fps
const DURATION = "2.24s";

// ============================================================================
// 12-point polygon definitions for clip-path morphing
//
// All coordinates are percentages of the bounding box.
// 12 points chosen so CSS can smoothly interpolate between shapes.
//
// Circle: dodecagon (12 pts evenly spaced by angle, r≈45%, center≈50.5% 50%)
// Triangle: 4 pts per edge, quad that visually reads as a triangle
// Square: 3 pts per edge, starting from top-center going clockwise
// ============================================================================

const CLIP_CIRCLE = `polygon(
  50.5% 5.3%,
  72.9% 11.2%,
  89.3% 27.6%,
  95.3% 50%,
  89.3% 72.4%,
  72.9% 88.8%,
  50.5% 94.8%,
  28.1% 88.8%,
  11.7% 72.4%,
  5.8% 50%,
  11.7% 27.6%,
  28.1% 11.2%
)`;

const CLIP_TRIANGLE = `polygon(
  50% 5%,
  59.6% 21.6%,
  69.2% 38.2%,
  78.8% 54.8%,
  88.4% 71.4%,
  69.2% 71.4%,
  50% 71.4%,
  30.8% 71.4%,
  11.6% 71.4%,
  21.2% 54.8%,
  30.8% 38.2%,
  40.4% 21.6%
)`;

const CLIP_SQUARE = `polygon(
  50.3% 17.5%,
  71.3% 17.5%,
  81.8% 17.5%,
  81.8% 38.5%,
  81.8% 59.5%,
  81.8% 80.5%,
  60.3% 80.5%,
  39.8% 80.5%,
  18.8% 80.5%,
  18.8% 59.5%,
  18.8% 38.5%,
  18.8% 17.5%
)`;

// ============================================================================
// SVG path definitions (viewBox 0 0 400 400)
//
// All three paths use the same structure: M + 4×C + Z (4 cubic bezier segments)
// so CSS can interpolate the `d` attribute between them.
//
// Circle: true cubic bezier arcs (matching the Lottie control points exactly)
// Triangle / Square: degenerate cubics (control pts at 1/3 & 2/3 of each edge)
// ============================================================================

const SVG_CIRCLE =
  "M 202 21 C 300.9 21 381 101.1 381 200 C 381 298.9 300.9 379 202 379 C 103.1 379 23 298.9 23 200 C 23 101.1 103.1 21 202 21 Z";

const SVG_TRIANGLE =
  "M 200 19.8 C 225.6 64.1 251.2 108.4 276.7 152.7 C 302.3 197 327.9 241.3 353.5 285.6 C 251.2 285.6 148.8 285.6 46.5 285.6 C 97.7 197 148.8 108.4 200 19.8 Z";

const SVG_SQUARE =
  "M 327 70 C 327 154 327 238 327 322 C 243 322 159 322 75 322 C 75 238 75 154 75 70 C 159 70 243 70 327 70 Z";

// ============================================================================
// Approach 1: CSS clip-path polygon morphing
//
// A single <div> with animated clip-path. The 12-point polygons allow CSS to
// smoothly interpolate between circle, triangle and square.
// Three separate keyframe tracks (shape, opacity, bounce) composed together.
// ============================================================================

const CLIP_PATH_KEYFRAMES = `
@keyframes xs-clip-shape {
  0%        { clip-path: ${CLIP_CIRCLE}; }
  23%       { clip-path: ${CLIP_TRIANGLE}; }
  33%       { clip-path: ${CLIP_TRIANGLE}; }
  61%       { clip-path: ${CLIP_SQUARE}; }
  72%       { clip-path: ${CLIP_SQUARE}; }
  93%, 100% { clip-path: ${CLIP_CIRCLE}; }
}

@keyframes xs-clip-opacity {
  0%        { opacity: 0.7; }
  23%       { opacity: 1; }
  33%       { opacity: 1; }
  61%       { opacity: 0.8; }
  72%       { opacity: 0.8; }
  93%, 100% { opacity: 0.7; }
}

@keyframes xs-clip-bounce {
  0%, 9%    { transform: translateY(0); }
  23%, 41%  { transform: translateY(10.5%); }
  52%, 100% { transform: translateY(0); }
}
`;

function ClipPathSpinner({
  size,
  color = DARK_COLOR,
}: {
  size: number;
  color?: string;
}) {
  return (
    <>
      <style>{CLIP_PATH_KEYFRAMES}</style>
      <div style={{ width: size, height: size, overflow: "hidden" }}>
        <div
          style={{
            width: "100%",
            height: "100%",
            background: color,
            clipPath: CLIP_CIRCLE,
            animation: [
              `xs-clip-shape ${DURATION} ease-in-out infinite`,
              `xs-clip-opacity ${DURATION} ease-in-out infinite`,
              `xs-clip-bounce ${DURATION} ease-in-out infinite`,
            ].join(", "),
          }}
        />
      </div>
    </>
  );
}

// ============================================================================
// Approach 2: SVG path `d` animation
//
// A single <svg> with one <path>. CSS animates the `d` attribute directly
// (supported in Chrome, Firefox, Safari). Uses true cubic bezier curves for
// the circle, giving the most faithful reproduction of the Lottie.
// ============================================================================

const SVG_PATH_KEYFRAMES = `
@keyframes xs-svg-shape {
  0%        { d: path("${SVG_CIRCLE}"); }
  23%       { d: path("${SVG_TRIANGLE}"); }
  33%       { d: path("${SVG_TRIANGLE}"); }
  61%       { d: path("${SVG_SQUARE}"); }
  72%       { d: path("${SVG_SQUARE}"); }
  93%, 100% { d: path("${SVG_CIRCLE}"); }
}

@keyframes xs-svg-opacity {
  0%        { opacity: 0.7; }
  23%       { opacity: 1; }
  33%       { opacity: 1; }
  61%       { opacity: 0.8; }
  72%       { opacity: 0.8; }
  93%, 100% { opacity: 0.7; }
}

@keyframes xs-svg-bounce {
  0%, 9%    { transform: translateY(0); }
  23%, 41%  { transform: translateY(42px); }
  52%, 100% { transform: translateY(0); }
}
`;

function SvgPathSpinner({
  size,
  color = DARK_COLOR,
}: {
  size: number;
  color?: string;
}) {
  return (
    <>
      <style>{SVG_PATH_KEYFRAMES}</style>
      <svg
        width={size}
        height={size}
        viewBox="0 0 400 400"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d={SVG_CIRCLE}
          fill={color}
          style={{
            animation: [
              `xs-svg-shape ${DURATION} ease-in-out infinite`,
              `xs-svg-opacity ${DURATION} ease-in-out infinite`,
              `xs-svg-bounce ${DURATION} ease-in-out infinite`,
            ].join(", "),
          }}
        />
      </svg>
    </>
  );
}

// ============================================================================
// Story helper
// ============================================================================

function SpinnerCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="s-flex s-flex-col s-items-center s-gap-2">
      <div className="s-p-3 s-border s-border-border s-rounded-lg s-bg-white">
        {children}
      </div>
      <span className="s-text-xs s-text-muted-foreground">{label}</span>
    </div>
  );
}

// ============================================================================
// Storybook meta
// ============================================================================

const meta = {
  title: "Primitives/LeanSpinner",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Experimental pure-CSS replacements for the spinnerDarkXS Lottie animation. " +
          "A single shape morphs: Circle → Triangle → Square → Circle.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ============================================================================
// Story — side-by-side comparison at SM size
// ============================================================================

export const Comparison: Story = {
  render: () => (
    <div className="s-flex s-items-start s-gap-8">
      <SpinnerCell label="Lottie (original)">
        <Spinner size="sm" variant="dark" />
      </SpinnerCell>
      <SpinnerCell label="clip-path polygon">
        <ClipPathSpinner size={SM_SIZE} color={DARK_COLOR} />
      </SpinnerCell>
      <SpinnerCell label="SVG path d">
        <SvgPathSpinner size={SM_SIZE} color={DARK_COLOR} />
      </SpinnerCell>
    </div>
  ),
};
