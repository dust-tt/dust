import type { Change } from "diff";
import { diffWords } from "diff";
import React, { useMemo } from "react";

interface InstructionsDiffProps {
  oldString: string;
  newString: string;
}

/**
 * Component to display a word-level diff between two strings.
 * Additions are shown in blue (highlight), deletions in orange (warning) with strikethrough.
 * Colors match the TipTap InstructionSuggestionExtension marks.
 */
export function InstructionsDiff({
  oldString,
  newString,
}: InstructionsDiffProps) {
  const diff = useMemo(
    () => diffWords(oldString, newString),
    [oldString, newString]
  );

  return (
    <div className="whitespace-pre-wrap font-mono text-sm">
      {diff.map((part: Change, index: number) => {
        if (part.added) {
          return (
            <span
              key={index}
              className="rounded bg-highlight-100 text-highlight-800 dark:bg-highlight-100-night"
            >
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span
              key={index}
              className="rounded bg-warning-100 text-warning-800 line-through dark:bg-warning-100-night"
            >
              {part.value}
            </span>
          );
        }
        return <span key={index}>{part.value}</span>;
      })}
    </div>
  );
}
