import { DiffBlock } from "@dust-tt/sparkle";

interface SkillFieldEditSectionProps {
  label: string;
  currentValue: string;
  newValue: string;
}

export function SkillFieldEditSection({
  label,
  currentValue,
  newValue,
}: SkillFieldEditSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <DiffBlock>
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
