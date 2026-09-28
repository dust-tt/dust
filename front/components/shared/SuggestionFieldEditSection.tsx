import { DiffBlock } from "@dust-tt/sparkle";

interface SuggestionFieldEditSectionProps {
  label: string;
  currentValue: string;
  newValue: string;
  // When false, the whole diff stays visible instead of collapsing behind a toggle.
  isCollapsible?: boolean;
}

export function SuggestionFieldEditSection({
  label,
  currentValue,
  newValue,
  isCollapsible = true,
}: SuggestionFieldEditSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <DiffBlock
        collapsedLines={isCollapsible ? undefined : Number.POSITIVE_INFINITY}
      >
        <div className="flex flex-col gap-1 p-3 text-sm">
          {currentValue && (
            <p className="text-muted-foreground line-through">{currentValue}</p>
          )}
          <p className="text-foreground">{newValue}</p>
        </div>
      </DiffBlock>
    </div>
  );
}
