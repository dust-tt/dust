import { useSkill } from "@app/lib/swr/skill_configurations";
import type { SkillReinforcementMode } from "@app/types/assistant/skill_configuration_constants";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { SkillReinforcementModeSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { Chip, LoadingBlock } from "@dust-tt/sparkle";

function reinforcementModeDisplay(mode: SkillReinforcementMode): {
  label: string;
  color: "success" | "primary" | "highlight";
} {
  switch (mode) {
    case "on":
      return { label: "On", color: "success" };
    case "off":
      return { label: "Off", color: "primary" };
    case "auto":
      return { label: "Automatic", color: "highlight" };
    default:
      assertNeverAndIgnore(mode);
      return { label: "Unknown", color: "primary" };
  }
}

interface ReinforcementModeChipProps {
  mode: SkillReinforcementMode;
}

function ReinforcementModeChip({ mode }: ReinforcementModeChipProps) {
  const display = reinforcementModeDisplay(mode);

  return <Chip size="xs" color={display.color} label={display.label} />;
}

interface SuggestedSkillReinforcementModeProps {
  suggestion: SkillReinforcementModeSuggestionType;
  skillId: string;
  workspaceId: string;
}

export function SuggestedSkillReinforcementMode({
  suggestion,
  skillId,
  workspaceId,
}: SuggestedSkillReinforcementModeProps) {
  const { skill, isSkillLoading } = useSkill({ workspaceId, skillId });

  if (isSkillLoading) {
    return <LoadingBlock className="h-16 w-full" />;
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">
        Self Improvement
      </span>
      <div className="flex items-center gap-2 rounded-xl border border-separator bg-background px-3 py-2.5">
        {skill && (
          <>
            <ReinforcementModeChip mode={skill.reinforcement} />
            <span className="text-xs text-muted-foreground">becomes</span>
          </>
        )}
        <ReinforcementModeChip mode={suggestion.reinforcement} />
      </div>
    </div>
  );
}
