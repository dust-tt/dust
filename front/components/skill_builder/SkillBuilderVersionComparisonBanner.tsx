import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import { useSkillVersionComparisonContext } from "@app/components/skill_builder/SkillBuilderVersionContext";
import { SkillVersionHistory } from "@app/components/skill_builder/SkillVersionHistory";
import type {
  SkillType,
  SkillWithVersionType,
} from "@app/types/assistant/skill_configuration";
import { Button, XMarkIcon } from "@dust-tt/sparkle";

interface SkillVersionHistoryPickerProps {
  skill: SkillType;
  skillHistory: SkillWithVersionType[];
}

export function SkillVersionHistoryPicker({
  skill,
  skillHistory,
}: SkillVersionHistoryPickerProps) {
  const { owner } = useSkillBuilderContext();
  const { compareVersion, isDiffMode, enterDiffMode, exitDiffMode } =
    useSkillVersionComparisonContext();

  if (skillHistory.length <= 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <SkillVersionHistory
        currentSkill={skill}
        history={skillHistory}
        selectedConfig={compareVersion}
        onSelect={enterDiffMode}
        owner={owner}
      />
      {isDiffMode && (
        <Button
          icon={XMarkIcon}
          variant="outline"
          size="sm"
          onClick={exitDiffMode}
          tooltip="Leave comparison mode"
        />
      )}
    </div>
  );
}
