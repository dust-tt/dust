import { Tooltip } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/core";
import React from "react";

export const DiffStats = ({ editor }: { editor: Editor | null }) => {
  if (!editor || !editor.storage.promptDiff?.isDiffMode) {
    return null;
  }

  const { addedWordCount = 0, removedWordCount = 0 } =
    editor.storage.promptDiff.diffStats;

  if (addedWordCount === 0 && removedWordCount === 0) {
    return null;
  }

  return (
    <div className="my-2 inline-flex items-center space-x-3 text-sm">
      <Tooltip
        label={`${addedWordCount} word${addedWordCount > 1 ? "s" : ""} added to the prompt`}
        trigger={
          <div className="text-success-foreground inline-flex items-center rounded bg-success-100 px-2 py-0.5">
            +{addedWordCount}
          </div>
        }
      />

      <Tooltip
        label={`${removedWordCount} word${removedWordCount > 1 ? "s" : ""} removed from the prompt`}
        trigger={
          <div className="inline-flex items-center rounded bg-warning-100 px-2 py-0.5 text-warning">
            -{removedWordCount}
          </div>
        }
      />

      <div className="inline-flex items-center space-x-1">
        {addedWordCount > 0 && (
          <div className="flex space-x-0.5">
            {Array.from({
              length: Math.min(Math.round(addedWordCount / 2), 5),
            }).map((_, i) => (
              <div
                key={`add-${i}`}
                className="h-2 w-2 rounded-sm bg-success"
                aria-hidden="true"
              />
            ))}
          </div>
        )}

        {removedWordCount > 0 && (
          <div className="ml-1 flex space-x-0.5">
            {Array.from({
              length: Math.min(Math.round(removedWordCount / 2), 5),
            }).map((_, i) => (
              <div
                key={`remove-${i}`}
                className="h-2 w-2 rounded-sm bg-warning"
                aria-hidden="true"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
