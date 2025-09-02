import {
  Button,
  CheckIcon,
  Dialog,
  DialogContent,
  DialogTrigger,
  EyeIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { diffWordsWithSpace, type Change } from "diff";
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

  const diffResult: Change[] = useMemo(() => {
    if (!currentInstructions) {
      return [{ added: true, value: suggestedInstructions } as Change];
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
          tooltip="Review changes"
          disabled={instructionsMatch}
        />
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-separator px-6 py-4">
          <h2 className="text-lg font-semibold">Compare Instructions</h2>
          <Button
            size="sm"
            variant="ghost"
            icon={XMarkIcon}
            onClick={() => setIsOpen(false)}
          />
        </div>

        <div className="min-h-0 flex-1 px-6 py-4">
          <div className="max-h-[60vh] min-h-[400px] overflow-y-auto rounded-lg border border-separator bg-slate-50 p-4 dark:bg-slate-900/50">
            <pre className="whitespace-pre-wrap font-mono text-sm">
              <div>
                {!currentInstructions ? (
                  <div className="rounded bg-green-50 px-2 py-1 text-green-700 dark:bg-green-900/20 dark:text-green-300">
                    {suggestedInstructions}
                  </div>
                ) : (
                  diffResult.map((part, index) => (
                    <span
                      key={index}
                      className={
                        part.added
                          ? "rounded bg-green-50 px-1 text-green-700 dark:bg-green-900/20 dark:text-green-300"
                          : part.removed
                            ? "rounded bg-red-50 px-1 text-red-700 line-through opacity-75 dark:bg-red-900/20 dark:text-red-300"
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

        <div className="flex flex-shrink-0 items-center justify-between border-t border-separator px-6 py-3">
          <div className="flex items-center gap-6">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-green-600 dark:text-green-400">
                +
                {diffResult
                  .filter((p) => p.added)
                  .reduce((acc, p) => acc + p.value.split(/\s+/).length, 0)}
              </span>
              {" / "}
              <span className="font-medium text-red-500 dark:text-red-400">
                -
                {diffResult
                  .filter((p) => p.removed)
                  .reduce((acc, p) => acc + p.value.split(/\s+/).length, 0)}
              </span>
              {" words"}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded border border-green-200 bg-green-50 dark:border-green-700 dark:bg-green-900/20"></div>
                <span>Added (suggested)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-3 w-3 rounded border border-red-200 bg-red-50 dark:border-red-700 dark:bg-red-900/20"></div>
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
              variant={
                hasBeenApplied || instructionsMatch ? "primary" : "highlight"
              }
              icon={hasBeenApplied || instructionsMatch ? CheckIcon : undefined}
              label={
                hasBeenApplied || instructionsMatch ? "Accepted" : "Accept"
              }
              onClick={handleApply}
              disabled={hasBeenApplied || instructionsMatch}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
