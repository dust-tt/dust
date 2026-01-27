import type { Change } from "diff";
import { diffWords } from "diff";
import React, { useMemo } from "react";

interface InstructionsDiffProps {
  oldString: string;
  newString: string;
}

/**
 * Component to display a word-level diff between two strings.
 * Additions are shown in green, deletions in orange with strikethrough.
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
              className="bg-success-100 text-success-700 dark:bg-success-100-night dark:text-success-700-night"
            >
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span
              key={index}
              className="bg-warning-100 text-warning-600 line-through dark:bg-warning-100-night dark:text-warning-600-night"
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
