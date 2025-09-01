import {
  Button,
  CheckIcon,
  Dialog,
  DialogContent,
  DialogTrigger,
  EyeIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { diffWordsWithSpace } from "diff";
import React, { useMemo, useState } from "react";

interface AgentInstructionsDiffDialogProps {
  currentInstructions?: string;
  suggestedInstructions: string;
  onApply?: (instructions: string) => void;
  messageId: string;
}

export function AgentInstructionsDiffDialog({
  currentInstructions,
  suggestedInstructions,
  onApply,
  messageId,
}: AgentInstructionsDiffDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasBeenApplied, setHasBeenApplied] = useState(false);

  const instructionsMatch =
    currentInstructions?.trim() === suggestedInstructions.trim();

  const diffResult = useMemo(() => {
    if (!currentInstructions) {
      return [
        {
          added: true,
          value: suggestedInstructions,
        },
      ];
    }

    const normalizeText = (text: string) => {
      return text
        .split("\n")
        .map((line) => line.trim())
        .join("\n")
        .trim();
    };

    const normalizedCurrent = normalizeText(currentInstructions);
    const normalizedSuggested = normalizeText(suggestedInstructions);

    return diffWordsWithSpace(normalizedCurrent, normalizedSuggested);
  }, [currentInstructions, suggestedInstructions]);

  const handleApply = () => {
    if (onApply) {
      onApply(suggestedInstructions);
      setHasBeenApplied(true);
      setTimeout(() => {
        setIsOpen(false);
        setHasBeenApplied(false);
      }, 1000);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          size="xs"
          variant="outline"
          icon={EyeIcon}
          tooltip="View Changes"
          disabled={instructionsMatch}
        />
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-separator flex-shrink-0">
          <h2 className="text-lg font-semibold">Compare Instructions</h2>
          <Button
            size="sm"
            variant="ghost"
            icon={XMarkIcon}
            onClick={() => setIsOpen(false)}
          />
        </div>

        <div className="flex-1 px-6 py-4 min-h-0">
          <div className="rounded-lg border border-separator bg-slate-50 dark:bg-slate-900/50 p-4 min-h-[400px] max-h-[60vh] overflow-y-auto">
            <pre className="text-sm font-mono whitespace-pre-wrap">
              <div>
                {!currentInstructions ? (
                  <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 px-2 py-1 rounded">
                    {suggestedInstructions}
                  </div>
                ) : (
                  diffResult.map((part, index) => (
                    <span
                      key={index}
                      className={
                        part.added
                          ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 px-1 rounded"
                          : part.removed
                          ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-1 rounded line-through opacity-75"
                          : "text-slate-700 dark:text-slate-300"
                      }
                    >
                      {part.value}
                    </span>
                  ))
                )}
              </div>
            </pre>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-separator flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-6">
            <div className="text-sm text-muted-foreground">
              <span className="text-green-600 dark:text-green-400 font-medium">
                +
                {diffResult
                  .filter((p) => p.added)
                  .reduce((acc, p) => acc + p.value.split(/\s+/).length, 0)}
              </span>
              {" / "}
              <span className="text-red-500 dark:text-red-400 font-medium">
                -
                {diffResult
                  .filter((p) => p.removed)
                  .reduce((acc, p) => acc + p.value.split(/\s+/).length, 0)}
              </span>
              {" words"}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded"></div>
                <span>Added (suggested)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded"></div>
                <span>Removed (current)</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              label="Cancel"
              onClick={() => setIsOpen(false)}
            />
            <Button
              size="sm"
              variant={hasBeenApplied || instructionsMatch ? "primary" : "highlight"}
              icon={hasBeenApplied || instructionsMatch ? CheckIcon : undefined}
              label={hasBeenApplied || instructionsMatch ? "Applied!" : "Apply Changes"}
              onClick={handleApply}
              disabled={hasBeenApplied || instructionsMatch}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

