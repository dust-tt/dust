import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { SkillBuilderInstructionsEditor } from "@app/components/skill_builder/SkillBuilderInstructionsEditor";
import { useSkillVersionComparisonContext } from "@app/components/skill_builder/SkillBuilderVersionContext";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { SKILL_INSTRUCTIONS_LABEL } from "@app/lib/skills/labels";
import {
  BookOpen01,
  Button,
  ContentMessage,
  InfoCircle,
  ReverseLeft,
  ShapesPlus,
} from "@dust-tt/sparkle";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

const LARGE_INSTRUCTIONS_CHARACTER_THRESHOLD = 40_000;

const INSTRUCTIONS_FIELD_NAME = "instructions";
const INSTRUCTIONS_HTML_FIELD_NAME = "instructionsHtml";

export function SkillBuilderInstructionsSection() {
  const { setValue, watch } = useFormContext<SkillBuilderFormData>();
  const { compareVersion, exitDiffMode } = useSkillVersionComparisonContext();
  const { hasFeature } = useFeatureFlags();
  const [addKnowledge, setAddKnowledge] = useState<(() => void) | null>(null);
  const [openCapabilities, setOpenCapabilities] = useState<(() => void) | null>(
    null
  );

  const enableSkillReferences = hasFeature("nested_skills");

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
          <h3 className="heading-lg font-semibold text-foreground dark:text-foreground-night">
            {SKILL_INSTRUCTIONS_LABEL}
          </h3>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Provide the guidelines the skill should follow when it runs. Type
            "/" to attach knowledge, tools, or another skill.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {instructionsDiffer && (
            <Button
              variant="outline"
              size="sm"
              icon={ReverseLeft}
              onClick={restoreInstructions}
              label="Restore instructions"
            />
          )}
          {!compareVersion && (
            <Button
              variant={enableSkillReferences ? "outline" : "primary"}
              label="Attach knowledge"
              icon={BookOpen01}
              onClick={addKnowledge ?? undefined}
              disabled={!addKnowledge}
            />
          )}
          {!compareVersion && enableSkillReferences && (
            <Button
              variant="primary"
              label="Attach capabilities"
              icon={ShapesPlus}
              onClick={openCapabilities ?? undefined}
              disabled={!openCapabilities}
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
          title="This skill is noticeably large"
        >
          Large skills consume a significant part of the context window on each
          use. Consider keeping your guidelines concise.
        </ContentMessage>
      )}
      <SkillBuilderInstructionsEditor
        onAddKnowledge={(fn) => setAddKnowledge(() => fn)}
        onOpenCapabilities={(fn) => setOpenCapabilities(() => fn)}
      />
    </section>
  );
}
