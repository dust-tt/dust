import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { SkillBuilderInstructionsEditor } from "@app/components/skill_builder/SkillBuilderInstructionsEditor";
import { useSkillVersionComparisonContext } from "@app/components/skill_builder/SkillBuilderVersionContext";
import { ArrowGoBackIcon, BookOpenIcon, Button } from "@dust-tt/sparkle";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

const INSTRUCTIONS_FIELD_NAME = "instructions";

export function SkillBuilderInstructionsSection() {
  const { setValue, watch } = useFormContext<SkillBuilderFormData>();
  const { compareVersion } = useSkillVersionComparisonContext();
  const [addKnowledge, setAddKnowledge] = useState<(() => void) | null>(null);

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
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col items-end justify-between gap-2 sm:flex-row">
        <h3 className="heading-lg font-semibold text-foreground dark:text-foreground-night">
          What guidelines should it provide?
        </h3>
        <div className="flex items-center gap-2">
          {instructionsDiffer && (
            <Button
              variant="outline"
              size="sm"
              icon={ArrowGoBackIcon}
              onClick={restoreInstructions}
              label="Restore instructions"
            />
          )}
          {!compareVersion && (
            <Button
              variant="primary"
              label="Attach knowledge"
              icon={BookOpenIcon}
              onClick={addKnowledge ?? undefined}
              disabled={!addKnowledge}
            />
          )}
        </div>
      </div>
      <SkillBuilderInstructionsEditor
        onAddKnowledge={(fn) => setAddKnowledge(() => fn)}
      />
    </section>
  );
}
