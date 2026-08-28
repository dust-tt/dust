import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { useSkillVersionComparisonContext } from "@app/components/skill_builder/SkillBuilderVersionContext";
import { Button, ReverseLeft, Separator } from "@dust-tt/sparkle";
import { useFormContext, useFormState } from "react-hook-form";

export function SkillBuilderVersionComparisonFooter() {
  const { compareVersion, exitDiffMode } = useSkillVersionComparisonContext();
  const { setValue } = useFormContext<SkillBuilderFormData>();
  const { disabled: isReadOnly } = useFormState<SkillBuilderFormData>();

  if (!compareVersion) {
    return null;
  }

  const restoreAll = () => {
    setValue("instructions", compareVersion.instructions ?? "", {
      shouldDirty: true,
    });
    setValue("instructionsHtml", compareVersion.instructionsHtml ?? "", {
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
    // The version's hand-picked spaces.
    // The spaces the current knowledge/tools/skills require are recomputed on save
    // and are unaffected by this.
    setValue(
      "additionalSpaces",
      compareVersion.manuallyRequestedSpaceIds ?? [],
      { shouldDirty: true }
    );
    exitDiffMode();
  };

  return (
    <div className="space-y-4">
      <Separator />
      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          icon={ReverseLeft}
          onClick={restoreAll}
          label="Restore all fields from this version"
          disabled={isReadOnly}
        />
      </div>
    </div>
  );
}
