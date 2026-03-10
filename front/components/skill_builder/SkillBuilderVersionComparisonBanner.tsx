import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { useSkillVersionComparisonContext } from "@app/components/skill_builder/SkillBuilderVersionContext";
import { SkillVersionHistory } from "@app/components/skill_builder/SkillVersionHistory";
import type {
  SkillType,
  SkillWithVersionType,
} from "@app/types/assistant/skill_configuration";
import {
  ArrowGoBackIcon,
  Button,
  Separator,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useFormContext } from "react-hook-form";

interface SkillVersionHistoryPickerProps {
  skill: SkillType;
  skillHistory: SkillWithVersionType[];
}

export function SkillVersionHistoryPicker({
  skill,
  skillHistory,
}: SkillVersionHistoryPickerProps) {
  const { owner } = useSkillBuilderContext();
  const { compareVersion, enterDiffMode, exitDiffMode } =
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
      {compareVersion && (
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

export function SkillBuilderVersionComparisonFooter() {
  const { compareVersion, exitDiffMode } = useSkillVersionComparisonContext();
  const { setValue } = useFormContext<SkillBuilderFormData>();

  if (!compareVersion) {
    return null;
  }

  const restoreAll = () => {
    setValue("instructions", compareVersion.instructions ?? "", {
      shouldDirty: true,
    });
    setValue("agentFacingDescription", compareVersion.agentFacingDescription, {
      shouldDirty: true,
    });
    setValue("tools", compareVersion.tools.map(getDefaultMCPAction), {
      shouldDirty: true,
    });
    setValue("fileAttachments", compareVersion.fileAttachments, {
      shouldDirty: true,
    });
    exitDiffMode();
  };

  return (
    <div className="space-y-4">
      <Separator />
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          icon={ArrowGoBackIcon}
          onClick={restoreAll}
          label="Restore all fields from this version"
        />
      </div>
    </div>
  );
}
