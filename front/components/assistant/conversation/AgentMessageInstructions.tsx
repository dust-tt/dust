import { Button, CheckIcon, ChevronDownIcon, ChevronUpIcon } from "@dust-tt/sparkle";
import React, { useEffect, useState } from "react";

import { AgentInstructionsDiffDialog } from "@app/components/assistant/conversation/AgentInstructionsDiffDialog";

interface AgentMessageInstructionsProps {
  instructions: string;
  currentInstructions?: string;
  onApply?: (instructions: string) => void;
  messageId: string;
  disableApply?: boolean;
}

export function AgentMessageInstructions({
  instructions,
  currentInstructions,
  onApply,
  messageId,
  disableApply = false,
}: AgentMessageInstructionsProps) {
  const [hasBeenApplied, setHasBeenApplied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [userToggled, setUserToggled] = useState(false);

  const instructionsMatch = currentInstructions?.trim() === instructions.trim();

  useEffect(() => {
    if (hasBeenApplied && !instructionsMatch) {
      setHasBeenApplied(false);
    }
  }, [instructionsMatch, hasBeenApplied]);

  // Auto-collapse very long instruction blocks for a cleaner view
  const lineCount = instructions.split("\n").length;
  const isCollapsible = lineCount > 16 || instructions.length > 1200;
  const showExpanded = isCollapsible ? isExpanded : true;

  // Auto-switch to collapsed when content gets long, unless user already chose.
  useEffect(() => {
    if (isCollapsible && !userToggled) {
      setIsExpanded(false);
    } else if (!isCollapsible && !userToggled) {
      setIsExpanded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCollapsible, instructions]);

  const handleApply = () => {
    if (onApply) {
      onApply(instructions);
      setHasBeenApplied(true);
    }
  };

  const isButtonDisabled =
    disableApply || instructionsMatch || (hasBeenApplied && instructionsMatch);

  return (
    <div className="mt-4 rounded-lg border border-separator bg-slate-50 dark:bg-slate-900/10">
      <div className="flex items-center justify-between border-b border-separator px-4 py-2">
        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Agent Instructions</span>
        <div className="flex items-center gap-2">
          <AgentInstructionsDiffDialog
            currentInstructions={currentInstructions}
            suggestedInstructions={instructions}
            onApply={onApply}
            messageId={messageId}
          />
          {onApply && (
            <Button
              size="xs"
              variant={instructionsMatch ? "primary" : "primary"}
              icon={CheckIcon}
              label={instructionsMatch || hasBeenApplied ? "Accepted" : "Accept"}
              onClick={handleApply}
              disabled={isButtonDisabled}
            />
          )}
        </div>
      </div>
      <div className="relative p-4">
        <div
          className={
            "whitespace-pre-wrap font-sans text-sm text-slate-700 dark:text-slate-300 overflow-hidden transition-all duration-300 ease-in-out " +
            (isCollapsible ? (showExpanded ? "max-h-[9999px]" : "max-h-64") : "max-h-[9999px]")
          }
        >
          {instructions}
        </div>
        {isCollapsible && !showExpanded && (
          <div className="pointer-events-none absolute bottom-4 left-4 right-4 h-16 bg-gradient-to-t from-slate-50 dark:from-slate-900/10 to-transparent" />
        )}
        {isCollapsible && (
          <div className="mt-3 flex justify-center">
            <Button
              size="xs"
              variant="ghost"
              icon={showExpanded ? ChevronUpIcon : ChevronDownIcon}
              label={showExpanded ? "Collapse" : "Expand"}
              onClick={() => {
                setIsExpanded((v) => !v);
                setUserToggled(true);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
