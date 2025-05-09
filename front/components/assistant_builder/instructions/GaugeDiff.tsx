import { cn } from "@dust-tt/sparkle";
import { diffWords } from "diff";
import React, { useMemo } from "react";

interface GaugeDiffProps {
  original: string;
  updated: string;
}

/**
 * Non-linear gauge showing word-level differences between two texts.
 * Uses a non-linear scale to emphasize small changes:
 * - 0-2% changes: 0-40% of bar width (green)
 * - 2-10% changes: 40-70% of bar width (yellow)
 * - 10-100% changes: 70-100% of bar width (red)
 */
export const GaugeDiff = React.forwardRef<HTMLDivElement, GaugeDiffProps>(
  ({ original, updated }, ref) => {
    const { widthPercent, colorClass } = useMemo(() => {
      // Count words in original text (with fallback for empty content)
      const origWords = (original || "").trim().split(/\s+/).filter(Boolean);
      const origCount = Math.max(origWords.length, 1); // Prevent division by zero

      // Calculate total words added and removed
      let added = 0,
        removed = 0;
      diffWords(original || "", updated || "").forEach((part) => {
        const wordCount = part.value.trim().split(/\s+/).filter(Boolean).length;
        if (part.added) {
          added += wordCount;
        }
        if (part.removed) {
          removed += wordCount;
        }
      });

      // Calculate raw percentage of change
      const rawPercentage = ((added + removed) / origCount) * 100;

      // Transform percentage to non-linear scale
      let displayWidth;
      if (rawPercentage <= 2) {
        // First 2% of changes takes up 40% of the bar
        displayWidth = (rawPercentage / 2) * 40;
      } else if (rawPercentage <= 10) {
        // Next 8% of changes takes up 30% of the bar
        displayWidth = 40 + ((rawPercentage - 2) / 8) * 30;
      } else {
        // Remaining 90% of changes takes up 30% of the bar
        displayWidth = 70 + ((Math.min(rawPercentage, 100) - 10) / 90) * 30;
      }

      // Determine color based on raw percentage
      const color =
        rawPercentage <= 2
          ? "bg-success"
          : rawPercentage <= 10
            ? "bg-golden-300"
            : "bg-warning";

      console.log(original, updated, rawPercentage)
      return { widthPercent: displayWidth, colorClass: color };
    }, [original, updated]);

    return (
      <div
        ref={ref}
        className="ml-2 h-2 w-9 flex-shrink-0 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700"
      >
        <div
          className={cn("h-full transition-all duration-150", colorClass)}
          style={{ width: `${widthPercent}%` }}
        />
      </div>
    );
  }
);

GaugeDiff.displayName = "GaugeDiff";
