import {
  Button,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { TrackerGenerationToProcess } from "@dust-tt/types";
import { useCallback, useState } from "react";

interface ChangeSuggestionsPanelProps {
  suggestions: TrackerGenerationToProcess[];
  onClose: () => void;
}

export default function ChangeSuggestionsPanel({
  suggestions,
  onClose,
}: ChangeSuggestionsPanelProps) {
  const [openIndices, setOpenIndices] = useState<Set<number>>(new Set());

  const toggleThinking = useCallback((idx: number) => {
    setOpenIndices((current) => {
      const newSet = new Set(current);
      if (newSet.has(idx)) {
        newSet.delete(idx);
      } else {
        newSet.add(idx);
      }
      return newSet;
    });
  }, []);

  // Sort suggestions by consumedAt/createdAt in descending order (most recent first)
  const sortedSuggestions = [...suggestions].sort((a, b) => {
    const dateA = new Date(b.consumedAt || b.createdAt).getTime();
    const dateB = new Date(a.consumedAt || a.createdAt).getTime();
    return dateA - dateB;
  });

  return (
    <div className="fixed right-0 top-0 z-50 flex h-full w-[480px] flex-col bg-white shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-structure-200 px-6 py-4">
        <h2 className="text-lg font-semibold">Change Suggestions</h2>
        <Button
          icon={XMarkIcon}
          variant="tertiary"
          onClick={onClose}
          label="Close panel"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {sortedSuggestions.length === 0 ? (
          <div className="text-center text-element-600">
            No change suggestions available.
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {sortedSuggestions.map((suggestion, idx) => (
              <div
                key={`${suggestion.id}-${idx}`}
                className="rounded-lg border border-structure-200 bg-structure-50 p-4"
              >
                {/* Watched Document */}
                <div className="mb-3">
                  <div className="mb-1 text-sm font-medium text-element-700">
                    Watched Document
                  </div>
                  <div className="text-sm text-element-900">
                    {suggestion.documentId}
                  </div>
                </div>

                {/* Maintained Document */}
                <div className="mb-3">
                  <div className="mb-1 text-sm font-medium text-element-700">
                    Maintained Document
                  </div>
                  <div className="text-sm text-element-900">
                    {suggestion.maintainedDocumentId}
                  </div>
                </div>

                {/* Content */}
                <div className="mb-3">
                  <div className="mb-1 text-sm font-medium text-element-700">
                    Suggestion
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-element-900">
                    {suggestion.content}
                  </div>
                </div>

                {/* Thinking (Collapsible) */}
                {suggestion.thinking && (
                  <div>
                    <Button
                      variant="tertiary"
                      size="xs"
                      label={
                        openIndices.has(idx) ? "Hide thinking" : "Show thinking"
                      }
                      icon={
                        openIndices.has(idx) ? ChevronUpIcon : ChevronDownIcon
                      }
                      onClick={() => toggleThinking(idx)}
                    />
                    {openIndices.has(idx) && (
                      <div className="mt-2 whitespace-pre-wrap rounded-md bg-structure-100 p-3 text-sm text-element-700">
                        {suggestion.thinking}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
