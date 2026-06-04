import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { InfoCircleV2, SliderToggle, Tooltip } from "@dust-tt/sparkle";
import { useFormContext } from "react-hook-form";

interface SkillBuilderEnableSuggestionsSectionProps {
  selfImprovementLock: boolean;
}

export function SkillBuilderEnableSuggestionsSection({
  selfImprovementLock,
}: SkillBuilderEnableSuggestionsSectionProps) {
  const { owner } = useSkillBuilderContext();
  const isAllowedByWorkspace = owner.metadata?.allowReinforcement === true;
  const isDisabled = !isAllowedByWorkspace || selfImprovementLock;

  const { watch, setValue } = useFormContext<SkillBuilderFormData>();
  const reinforcement = watch("reinforcement");
  const enabled = reinforcement !== "off";

  const handleToggle = () => {
    if (isDisabled) {
      return;
    }
    setValue("reinforcement", enabled ? "off" : "on", { shouldDirty: true });
  };

  return (
    <div className="flex flex-col gap-2">
      {isDisabled && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground dark:text-muted-foreground-night">
          <InfoCircleV2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {!isAllowedByWorkspace
              ? "Self-improving skills are disabled in your workspace. Ask your admin to enable this feature."
              : "Admin has disabled self-improvement for this skill."}
          </span>
        </div>
      )}
      <div
        className={`flex items-center gap-2 ${isDisabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <SliderToggle
          selected={enabled && !isDisabled}
          onClick={handleToggle}
          size="xs"
        />
        <span className="text-sm text-foreground dark:text-foreground-night">
          Self-improve
        </span>
        <Tooltip
          label="Dust will analyze how this skill is used and suggest improvements to its instructions over time."
          trigger={
            <InfoCircleV2 className="text-muted-foreground dark:text-muted-foreground-night h-4 w-4" />
          }
        />
      </div>
    </div>
  );
}
