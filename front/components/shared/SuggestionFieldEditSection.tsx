import { SUGGESTION_DIFF_CLASSES } from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import { DiffBlock } from "@dust-tt/sparkle";
import { diffWords } from "diff";

// "boxed" shows the diff in its own collapsible box. "inline" is for cards that already frame
// the diff: it shows in full with no box, and removed and added words are highlighted in place.
export type SuggestionDiffLayout = "boxed" | "inline";

interface SuggestionFieldEditSectionProps {
  label: string;
  currentValue: string;
  newValue: string;
  layout?: SuggestionDiffLayout;
}

export function SuggestionFieldEditSection({
  label,
  currentValue,
  newValue,
  layout = "boxed",
}: SuggestionFieldEditSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <DiffBlock
        isCollapsible={layout === "boxed"}
        variant={layout === "inline" ? "plain" : "default"}
      >
        {layout === "inline" ? (
          <p className="text-sm text-foreground">
            {/* Everything is new on a creation, so a word diff would just color the whole text. */}
            {currentValue === ""
              ? newValue
              : diffWords(currentValue, newValue).map((part, index) => (
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
