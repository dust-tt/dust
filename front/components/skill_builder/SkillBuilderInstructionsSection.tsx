import type { SkillBuilderFormData } from "@app/components/skill_builder/skillBuilderFormSchema";
import { SkillBuilderInstructionsEditor } from "@app/components/skill_builder/SkillBuilderInstructionsEditor";
import { useSkillVersionComparisonContext } from "@app/components/skill_builder/SkillBuilderVersionContext";
import {
  Button,
  ContentMessage,
  InfoCircle,
  Plus,
  ReverseLeft,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { useFormContext, useFormState } from "react-hook-form";

const LARGE_INSTRUCTIONS_CHARACTER_THRESHOLD = 40_000;

const INSTRUCTIONS_FIELD_NAME = "instructions";
const INSTRUCTIONS_HTML_FIELD_NAME = "instructionsHtml";

export function SkillBuilderInstructionsSection() {
  const { t } = useLingui();
  const { setValue, watch } = useFormContext<SkillBuilderFormData>();
  const { disabled: isReadOnly } = useFormState<SkillBuilderFormData>();
  const { compareVersion, exitDiffMode } = useSkillVersionComparisonContext();
  const [openInsertMenu, setOpenInsertMenu] = useState<(() => void) | null>(
    null
  );

  const currentInstructions = watch(INSTRUCTIONS_FIELD_NAME);
  const instructionsDiffer =
    compareVersion && compareVersion.instructions !== currentInstructions;

  const restoreInstructions = () => {
    if (!compareVersion) {
      return;
    }

    setValue(INSTRUCTIONS_FIELD_NAME, compareVersion.instructions ?? "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(
      INSTRUCTIONS_HTML_FIELD_NAME,
      compareVersion.instructionsHtml ?? "",
      { shouldDirty: true }
    );
    exitDiffMode();
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row">
        <div className="space-y-1">
          <h3 className="heading-lg font-semibold text-foreground">
            <Trans>Instructions</Trans>
          </h3>
          <p className="text-sm text-muted-foreground">
            <Trans>
              Provide the guidelines the skill should follow when it runs. Type
              "/" to attach knowledge, tools, or another skill.
            </Trans>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {instructionsDiffer && (
            <Button
              variant="outline"
              size="sm"
              icon={ReverseLeft}
              onClick={restoreInstructions}
              label={t`Restore instructions`}
              disabled={isReadOnly}
            />
          )}
          {!compareVersion && (
            <Button
              variant="outline"
              label={t({
                message: "Insert",
                context: "button, insert content in the instructions",
              })}
              icon={Plus}
              onClick={openInsertMenu ?? undefined}
              disabled={isReadOnly || !openInsertMenu}
            />
          )}
        </div>
      </div>
      {(currentInstructions?.length ?? 0) >
        LARGE_INSTRUCTIONS_CHARACTER_THRESHOLD && (
        <ContentMessage
          variant="info"
          icon={InfoCircle}
          size="lg"
          title={t`This skill is noticeably large`}
        >
          <Trans>
            Large skills consume a significant part of the context window on
            each use. Consider keeping your guidelines concise.
          </Trans>
        </ContentMessage>
      )}
      <SkillBuilderInstructionsEditor
        onOpenInsertMenu={(fn) => setOpenInsertMenu(() => fn)}
      />
    </section>
  );
}
