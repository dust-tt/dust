import { pluralize } from "@app/types/shared/utils/string_utils";
import { useId } from "react";

import styles from "./SkillImportLoading.module.css";

const PUZZLE_PATH =
  "M30 17h22c0-8 6-14 14-14s14 6 14 14h18c7 0 12 5 12 12v18c8 0 14 6 14 14s-6 14-14 14v19c0 7-5 12-12 12H80c0-8-6-14-14-14s-14 6-14 14H30c-7 0-12-5-12-12V75C10 75 4 69 4 61s6-14 14-14V29c0-7 5-12 12-12Z";

interface SkillImportLoadingProps {
  importType: "repository" | "files";
  selectedCount: number;
}

export function SkillImportLoading({
  importType,
  selectedCount,
}: SkillImportLoadingProps) {
  const puzzleClipId = useId();
  const liquidGradientId = useId();

  const source = importType === "repository" ? " from GitHub" : "";

  return (
    <div
      className={styles.root}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={`Importing ${selectedCount} skill${pluralize(selectedCount)}${source}.`}
    >
      <div className={styles.animation} aria-hidden="true">
        <div className={styles.halo} />
        <div className={styles.ripple} />
        <svg
          className={styles.puzzle}
          viewBox="0 0 128 128"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <clipPath id={puzzleClipId}>
              <path d={PUZZLE_PATH} />
            </clipPath>
            <linearGradient
              id={liquidGradientId}
              x1="64"
              y1="32"
              x2="64"
              y2="132"
              gradientUnits="userSpaceOnUse"
            >
              <stop className={styles.liquidTop} />
              <stop offset="1" className={styles.liquidBottom} />
            </linearGradient>
          </defs>

          <path className={styles.puzzleBase} d={PUZZLE_PATH} />

          <g clipPath={`url(#${puzzleClipId})`}>
            <g className={styles.waterRise}>
              <path
                className={styles.backWave}
                d="M-128 35Q-112 23-96 35T-64 35T-32 35T0 35T32 35T64 35T96 35T128 35T160 35T192 35T224 35T256 35V160H-128Z"
              />
              <path
                className={styles.frontWave}
                fill={`url(#${liquidGradientId})`}
                d="M-128 39Q-112 29-96 39T-64 39T-32 39T0 39T32 39T64 39T96 39T128 39T160 39T192 39T224 39T256 39V160H-128Z"
              />
              <ellipse
                className={styles.liquidSheen}
                cx="45"
                cy="60"
                rx="11"
                ry="34"
                transform="rotate(24 45 60)"
              />
              <circle className={styles.bubbleOne} cx="37" cy="91" r="3" />
              <circle className={styles.bubbleTwo} cx="82" cy="76" r="2" />
              <circle className={styles.bubbleThree} cx="96" cy="98" r="4" />
              <circle className={styles.bubbleFour} cx="62" cy="112" r="1.75" />
            </g>
          </g>

          <path className={styles.puzzleHighlight} d={PUZZLE_PATH} />
          <path className={styles.puzzleOutline} d={PUZZLE_PATH} />
        </svg>
      </div>

      <div className={styles.copy}>
        <p className="heading-base text-foreground">
          Fitting everything together…
        </p>
        <p className="copy-sm text-muted-foreground">
          Importing {selectedCount} skill{pluralize(selectedCount)}
          {source}. This can take a moment.
        </p>
      </div>
    </div>
  );
}
