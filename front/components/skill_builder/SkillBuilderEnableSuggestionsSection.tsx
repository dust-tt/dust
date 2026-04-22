import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { InformationCircleIcon, SliderToggle, Tooltip } from "@dust-tt/sparkle";
import { useFormContext } from "react-hook-form";

export function SkillBuilderEnableSuggestionsSection() {
  const { hasFeature } = useFeatureFlags();
  const { watch, setValue } = useFormContext<SkillBuilderFormData>();
  const reinforcement = watch("reinforcement");
  const enabled = reinforcement !== "off";

  if (!hasFeature("reinforcement_ui")) {
    return null;
  }

  const handleToggle = () => {
    setValue("reinforcement", enabled ? "off" : "auto", { shouldDirty: true });
  };

  return (
    <div className="flex items-center gap-2">
      <SliderToggle selected={enabled} onClick={handleToggle} size="xs" />
      <span className="text-sm text-foreground dark:text-foreground-night">
        Enable suggestions
      </span>
      <Tooltip
        label="Dust will analyze how this skill is used and suggest improvements to its instructions over time."
        trigger={
          <InformationCircleIcon className="text-muted-foreground dark:text-muted-foreground-night h-4 w-4" />
        }
      />
    </div>
  );
}
