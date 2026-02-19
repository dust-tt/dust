import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { SkillBuilderInstructionsEditor } from "@app/components/skill_builder/SkillBuilderInstructionsEditor";
import { SkillInstructionsHistory } from "@app/components/skill_builder/SkillInstructionsHistory";
import { useSkillHistory } from "@app/lib/swr/skill_configurations";
import type {
  SkillType,
  SkillWithVersionType,
} from "@app/types/assistant/skill_configuration";
import {
  ArrowPathIcon,
  BookOpenIcon,
  Button,
  Label,
  Separator,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { format } from "date-fns/format";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

const INSTRUCTIONS_FIELD_NAME = "instructions";

interface SkillBuilderInstructionsSectionProps {
  skill?: SkillType;
}

export function SkillBuilderInstructionsSection({
  skill,
}: SkillBuilderInstructionsSectionProps) {
  const { owner } = useSkillBuilderContext();
  const { setValue } = useFormContext<SkillBuilderFormData>();
  const [compareVersion, setCompareVersion] =
    useState<SkillWithVersionType | null>(null);
  const [isInstructionDiffMode, setIsInstructionDiffMode] = useState(false);
  const [addKnowledge, setAddKnowledge] = useState<(() => void) | null>(null);

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
        <h3 className="heading-lg font-semibold text-foreground dark:text-foreground-night">
          What guidelines should it provide?
        </h3>
        <div className="flex items-center gap-2">
          {headerActions}
          <Button
            variant="primary"
            label="Attach knowledge"
            icon={BookOpenIcon}
            onClick={addKnowledge ?? undefined}
            disabled={!addKnowledge}
          />
        </div>
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
        onAddKnowledge={(fn) => setAddKnowledge(() => fn)}
      />
    </section>
  );
}
