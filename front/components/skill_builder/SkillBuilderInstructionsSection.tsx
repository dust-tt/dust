import {
  ArrowPathIcon,
  Button,
  Label,
  Separator,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { format } from "date-fns/format";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { SkillBuilderInstructionsEditor } from "@app/components/skill_builder/SkillBuilderInstructionsEditor";
import { SkillInstructionsHistory } from "@app/components/skill_builder/SkillInstructionsHistory";
import { useSkillHistory } from "@app/lib/swr/skill_configurations";
import type { SkillType } from "@app/types/assistant/skill_configuration";

const INSTRUCTIONS_FIELD_NAME = "instructions";

interface SkillBuilderInstructionsSectionProps {
  skill?: SkillType;
}

export function SkillBuilderInstructionsSection({
  skill,
}: SkillBuilderInstructionsSectionProps) {
  const { owner } = useSkillBuilderContext();
  const { setValue } = useFormContext<SkillBuilderFormData>();
  const [compareVersion, setCompareVersion] = useState<SkillType | null>(null);
  const [isInstructionDiffMode, setIsInstructionDiffMode] = useState(false);

  const { skillHistory } = useSkillHistory({
    owner,
    skill,
    disabled: !skill,
    limit: 30,
  });

  const restoreVersion = () => {
    const text = compareVersion?.instructions;
    if (!text) {
      return;
    }

    setValue(INSTRUCTIONS_FIELD_NAME, text, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setCompareVersion(null);
    setIsInstructionDiffMode(false);
  };

  const headerActions = skill && skillHistory && skillHistory.length > 1 && (
    <SkillInstructionsHistory
      currentSkill={skill}
      history={skillHistory}
      selectedConfig={compareVersion}
      onSelect={(config) => {
        setCompareVersion(config);
        setIsInstructionDiffMode(true);
      }}
      owner={owner}
    />
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col items-end justify-between gap-2 sm:flex-row">
        <div>
          <h3 className="heading-base font-semibold text-foreground dark:text-foreground-night">
            How should this skill behave?
          </h3>
        </div>
        {headerActions && (
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            <div className="flex items-center gap-2">{headerActions}</div>
          </div>
        )}
      </div>
      {isInstructionDiffMode && compareVersion && (
        <>
          <Separator />
          {compareVersion?.createdAt && (
            <Label>
              Comparing current version with{" "}
              {format(compareVersion.createdAt, "Pp")}
            </Label>
          )}
          <div className="flex gap-2">
            <Button
              icon={XMarkIcon}
              variant="outline"
              size="sm"
              onClick={() => {
                setIsInstructionDiffMode(false);
                setCompareVersion(null);
              }}
              label="Leave comparison mode"
            />
            <Button
              variant="warning"
              size="sm"
              icon={ArrowPathIcon}
              onClick={restoreVersion}
              label="Restore this version"
            />
          </div>
        </>
      )}
      <SkillBuilderInstructionsEditor
        compareVersion={compareVersion}
        isInstructionDiffMode={isInstructionDiffMode}
      />
    </section>
  );
}
