import { Button, CheckIcon } from "@dust-tt/sparkle";
import React, { useEffect, useState } from "react";

import { AgentInstructionsDiffDialog } from "@app/components/assistant/conversation/AgentInstructionsDiffDialog";

interface AgentMessageInstructionsProps {
  instructions: string;
  currentInstructions?: string;
  onApply?: (instructions: string) => void;
  messageId: string;
}

export function AgentMessageInstructions({
  instructions,
  currentInstructions,
  onApply,
  messageId,
}: AgentMessageInstructionsProps) {
  const [hasBeenApplied, setHasBeenApplied] = useState(false);

  const instructionsMatch = currentInstructions?.trim() === instructions.trim();

  useEffect(() => {
    if (hasBeenApplied && !instructionsMatch) {
      setHasBeenApplied(false);
    }
  }, [instructionsMatch, hasBeenApplied]);

  const handleApply = () => {
    if (onApply) {
      onApply(instructions);
      setHasBeenApplied(true);
    }
  };

  const isButtonDisabled =
    instructionsMatch || (hasBeenApplied && instructionsMatch);

  return (
    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/10">
      <div className="flex items-center justify-between border-b border-blue-200 px-4 py-2 dark:border-blue-700">
        <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
          Agent Instructions
        </span>
        {onApply && (
          <div className="flex items-center gap-2">
            <AgentInstructionsDiffDialog
              currentInstructions={currentInstructions}
              suggestedInstructions={instructions}
              onApply={onApply}
              messageId={messageId}
            />
            <Button
              size="xs"
              variant={instructionsMatch ? "primary" : "highlight"}
              icon={instructionsMatch ? CheckIcon : undefined}
              label={instructionsMatch ? "Applied!" : "Apply to Agent"}
              onClick={handleApply}
              disabled={isButtonDisabled}
            />
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="whitespace-pre-wrap font-sans text-sm text-slate-700 dark:text-slate-300">
          {instructions}
        </div>
      </div>
    </div>
  );
}
