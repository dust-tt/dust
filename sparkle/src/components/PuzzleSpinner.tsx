import React from "react";

const PUZZLE_PATH =
  "M30 17h22c0-8 6-14 14-14s14 6 14 14h18c7 0 12 5 12 12v18c8 0 14 6 14 14s-6 14-14 14v19c0 7-5 12-12 12H80c0-8-6-14-14-14s-14 6-14 14H30c-7 0-12-5-12-12V75C10 75 4 69 4 61s6-14 14-14V29c0-7 5-12 12-12Z";

/**
 * An easter-egg puzzle-shaped loading indicator, made exclusively for the
 * skill-import animation. Do not use it anywhere else: for a standard async
 * button use the Button's own `isLoading` prop, and use plain Spinner for
 * generic loading states.
 * @summary Easter egg — reserved for the skill-import animation.
 */
export function PuzzleSpinner() {
  const puzzleClipId = React.useId();

  return (
    <svg
      className="puzzle-spinner-icon"
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={puzzleClipId}>
          <path d={PUZZLE_PATH} />
        </clipPath>
      </defs>

      <path className="puzzle-spinner-base" d={PUZZLE_PATH} />

      <g clipPath={`url(#${puzzleClipId})`}>
        <g className="puzzle-spinner-water-cycle">
          <path
            className="puzzle-spinner-back-wave"
            d="M-128 35Q-112 23-96 35T-64 35T-32 35T0 35T32 35T64 35T96 35T128 35T160 35T192 35T224 35T256 35V160H-128Z"
          />
          <path
            className="puzzle-spinner-front-wave"
            d="M-128 39Q-112 29-96 39T-64 39T-32 39T0 39T32 39T64 39T96 39T128 39T160 39T192 39T224 39T256 39V160H-128Z"
          />
        </g>
      </g>

      <path className="puzzle-spinner-outline" d={PUZZLE_PATH} />
    </svg>
  );
}
