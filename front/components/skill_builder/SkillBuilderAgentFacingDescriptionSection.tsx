import { editorVariants } from "@app/components/editor/editorStyles";
import {
  SkillDescriptionEditorContent,
  useSkillDescriptionEditor,
} from "@app/components/editor/SkillDescriptionEditor";
import { SKILL_BUILDER_AGENT_DESCRIPTION_BLUR_EVENT } from "@app/components/skill_builder/events";
import { SimilarSkillsDisplay } from "@app/components/skill_builder/SimilarSkillsDisplay";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { useSkillVersionComparisonContext } from "@app/components/skill_builder/SkillBuilderVersionContext";
import { useDebounceWithAbort } from "@app/hooks/useDebounce";
import { useSimilarSkills, useSkills } from "@app/lib/swr/skill_configurations";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { ArrowGoBackIcon, Button, cn } from "@dust-tt/sparkle";
import type { Transaction } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";
import { useController, useFormContext } from "react-hook-form";

const FIELD_NAME = "agentFacingDescription";
const DEBOUNCE_DELAY_MS = 250;
const MIN_DESCRIPTION_LENGTH = 10;
const DESCRIPTION_EDITOR_SIZE = "h-40 max-h-96";

export function SkillBuilderAgentFacingDescriptionSection() {
  const { owner, skillId } = useSkillBuilderContext();
  const { setValue, watch } = useFormContext<SkillBuilderFormData>();
  const { compareVersion, isDiffMode } = useSkillVersionComparisonContext();

  const { field: descriptionField, fieldState: descriptionFieldState } =
    useController<SkillBuilderFormData, typeof FIELD_NAME>({
      name: FIELD_NAME,
    });

  const { getSimilarSkills } = useSimilarSkills({ owner });
  const { skills } = useSkills({ owner });

  const [similarSkills, setSimilarSkills] = useState<SkillType[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const currentDescription = watch(FIELD_NAME);
  const descriptionDiffers =
    compareVersion &&
    compareVersion.agentFacingDescription !== currentDescription;

  const restoreDescription = () => {
    if (!compareVersion) {
      return;
    }
    setValue(FIELD_NAME, compareVersion.agentFacingDescription, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const fetchSimilarSkills = useCallback(
    async (description: string, signal: AbortSignal) => {
      if (description.length < MIN_DESCRIPTION_LENGTH) {
        setSimilarSkills([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      const result = await getSimilarSkills(description, {
        excludeSkillId: skillId,
        signal,
      });

      if (!signal.aborted) {
        setIsLoading(false);
        if (result.isOk()) {
          const similarSkillIds = new Set(result.value);
          setSimilarSkills(
            skills.filter((skill) => similarSkillIds.has(skill.sId))
          );
        }
      }
    },
    [getSimilarSkills, skillId, skills]
  );

  const triggerSimilarSkillsFetch = useDebounceWithAbort(fetchSimilarSkills, {
    delayMs: DEBOUNCE_DELAY_MS,
  });

  const handleUpdate = useCallback(
    ({ editor, transaction }: { editor: Editor; transaction: Transaction }) => {
      if (transaction.docChanged && !editor.isDestroyed) {
        const text = editor.getText().trim();
        setValue(FIELD_NAME, text, { shouldDirty: true });
        triggerSimilarSkillsFetch(text);
      }
    },
    [setValue, triggerSimilarSkillsFetch]
  );

  const handleBlur = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent(SKILL_BUILDER_AGENT_DESCRIPTION_BLUR_EVENT)
    );
  }, []);

  const { editor } = useSkillDescriptionEditor({
    content: descriptionField.value ?? "",
    onUpdate: handleUpdate,
    onBlur: handleBlur,
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setOptions({
      editorProps: {
        attributes: {
          class: cn(
            editorVariants({
              error: !!descriptionFieldState.error,
              disabled: isDiffMode,
            }),
            DESCRIPTION_EDITOR_SIZE
          ),
        },
      },
    });
  }, [editor, descriptionFieldState.error, isDiffMode]);

  // Sync external changes to the editor content.
  useEffect(() => {
    if (!editor || descriptionField.value === undefined) {
      return;
    }

    if (editor.isFocused) {
      return;
    }

    const currentText = editor.getText().trim();
    if (currentText !== descriptionField.value) {
      editor.commands.setContent(`<p>${descriptionField.value}</p>`, {
        emitUpdate: false,
      });
    }
  }, [editor, descriptionField.value]);

  // Apply/exit diff mode for description.
  useEffect(() => {
    if (!editor) {
      return;
    }

    if (compareVersion) {
      if (editor.storage.agentInstructionDiff?.isDiffMode) {
        editor.commands.exitDiff();
      }

      const compareText = compareVersion.agentFacingDescription;
      const currentText = descriptionField.value ?? "";

      editor.commands.setContent(`<p>${currentText}</p>`, {
        emitUpdate: false,
      });
      editor.commands.applyDiff(compareText, currentText);
      editor.setEditable(false);
    } else if (editor.storage.agentInstructionDiff?.isDiffMode) {
      editor.commands.exitDiff();
      editor.setEditable(true);
    }
  }, [compareVersion, editor, descriptionField.value]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="heading-lg font-semibold text-foreground dark:text-foreground-night">
          What will this skill be used for?
        </h3>
        {descriptionDiffers && (
          <Button
            variant="outline"
            size="sm"
            icon={ArrowGoBackIcon}
            onClick={restoreDescription}
            label="Restore description"
          />
        )}
      </div>

      <div className="space-y-3">
        <div className="space-y-1 p-px">
          <SkillDescriptionEditorContent editor={editor} />

          {descriptionFieldState.error && (
            <div className="dark:text-warning-night ml-2 text-xs text-warning">
              {descriptionFieldState.error.message}
            </div>
          )}
        </div>

        {!isDiffMode && (
          <SimilarSkillsDisplay
            owner={owner}
            similarSkills={similarSkills}
            isLoading={isLoading}
          />
        )}
      </div>
    </section>
  );
}
