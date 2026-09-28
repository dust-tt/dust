import { SUGGESTION_DIFF_CLASSES } from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import { DiffBlock } from "@dust-tt/sparkle";
import { diffWords } from "diff";

interface SuggestionFieldEditSectionProps {
  label: string;
  currentValue: string;
  newValue: string;
  // Shown in a conversation: the whole diff stays visible, blends into its section and
  // highlights removed and added words inline instead of stacking both values.
  isConversational?: boolean;
}

export function SuggestionFieldEditSection({
  label,
  currentValue,
  newValue,
  isConversational = false,
}: SuggestionFieldEditSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <DiffBlock
        isCollapsible={!isConversational}
        variant={isConversational ? "plain" : "default"}
      >
        {isConversational ? (
          <p className="p-3 text-sm text-foreground">
            {diffWords(currentValue, newValue).map((part, index) => (
              <span
                key={index}
                className={
                  part.added
                    ? SUGGESTION_DIFF_CLASSES.add
                    : part.removed
                      ? SUGGESTION_DIFF_CLASSES.remove
                      : undefined
                }
              >
                {part.value}
              </span>
            ))}
          </p>
        ) : (
          <div className="flex flex-col gap-1 p-3 text-sm">
            {currentValue && (
              <p className="text-muted-foreground line-through">
                {currentValue}
              </p>
            )}
            <p className="text-foreground">{newValue}</p>
          </div>
        )}
      </DiffBlock>
    </div>
  );
}
