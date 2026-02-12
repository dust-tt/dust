import type { Transaction } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { cva } from "class-variance-authority";
import debounce from "lodash/debounce";
import { useCallback, useEffect, useMemo } from "react";
import { useController, useFormContext } from "react-hook-form";

import { KNOWLEDGE_NODE_TYPE } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import type { KnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";
import {
  SkillInstructionsEditorContent,
  useSkillInstructionsEditor,
} from "@app/components/editor/SkillInstructionsEditor";
import { SKILL_BUILDER_INSTRUCTIONS_BLUR_EVENT } from "@app/components/skill_builder/events";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import type { SkillType } from "@app/types/assistant/skill_configuration";

const INSTRUCTIONS_FIELD_NAME = "instructions";
const ATTACHED_KNOWLEDGE_FIELD_NAME = "attachedKnowledge";

function collectKnowledgeItems(editor: Editor): KnowledgeItem[] {
  const items: KnowledgeItem[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === KNOWLEDGE_NODE_TYPE && node.attrs?.selectedItems) {
      const selectedItems = node.attrs.selectedItems as KnowledgeItem[];
      items.push(...selectedItems);
    }
  });
  return items;
}

function toAttachedKnowledge(
  items: readonly KnowledgeItem[]
): SkillBuilderFormData["attachedKnowledge"] {
  return items.map((item) => ({
    dataSourceViewId: item.dataSourceViewId,
    nodeId: item.nodeId,
    spaceId: item.spaceId,
    title: item.label,
  }));
}

const editorVariants = cva(
  [
    "overflow-auto border rounded-xl px-3 pt-2 pb-8 resize-y min-h-60 max-h-[1024px]",
    "transition-all duration-200",
    "bg-muted-background dark:bg-muted-background-night",
  ],
  {
    variants: {
      error: {
        true: [
          "border-border-warning/30 dark:border-border-warning-night/60",
          "ring-warning/0 dark:ring-warning-night/0",
          "focus-visible:border-border-warning dark:focus-visible:border-border-warning-night",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-warning/10 dark:focus-visible:ring-warning/30",
        ],
        false: [
          "border-border dark:border-border-night",
          "focus:ring-highlight-300 dark:focus:ring-highlight-300-night",
          "focus:outline-highlight-200 dark:focus:outline-highlight-200-night",
          "focus:border-highlight-300 dark:focus:border-highlight-300-night",
        ],
      },
    },
    defaultVariants: {
      error: false,
    },
  }
);

interface SkillBuilderInstructionsEditorProps {
  compareVersion?: SkillType | null;
  isInstructionDiffMode?: boolean;
  onAddKnowledge?: (addKnowledge: () => void) => void;
}

export function SkillBuilderInstructionsEditor({
  compareVersion,
  isInstructionDiffMode = false,
  onAddKnowledge,
}: SkillBuilderInstructionsEditorProps) {
  const { setValue } = useFormContext<SkillBuilderFormData>();

  const { field: instructionsField, fieldState: instructionsFieldState } =
    useController<SkillBuilderFormData, typeof INSTRUCTIONS_FIELD_NAME>({
      name: INSTRUCTIONS_FIELD_NAME,
    });

  const { fieldState: attachedKnowledgeFieldState } = useController<
    SkillBuilderFormData,
    typeof ATTACHED_KNOWLEDGE_FIELD_NAME
  >({
    name: ATTACHED_KNOWLEDGE_FIELD_NAME,
  });

  const displayError =
    !!instructionsFieldState.error || !!attachedKnowledgeFieldState.error;

  const debouncedUpdate = useMemo(
    () =>
      debounce((editor: Editor) => {
        if (!isInstructionDiffMode && !editor.isDestroyed) {
          setValue(INSTRUCTIONS_FIELD_NAME, editor.getMarkdown().trim(), {
            shouldDirty: true,
          });
          setValue(
            ATTACHED_KNOWLEDGE_FIELD_NAME,
            toAttachedKnowledge(collectKnowledgeItems(editor)),
            { shouldDirty: true }
          );
        }
      }, 250),
    [isInstructionDiffMode, setValue]
  );

  const handleUpdate = useCallback(
    ({ editor, transaction }: { editor: Editor; transaction: Transaction }) => {
      if (transaction.docChanged) {
        debouncedUpdate(editor);
      }
    },
    [debouncedUpdate]
  );

  const handleBlur = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent(SKILL_BUILDER_INSTRUCTIONS_BLUR_EVENT)
    );
  }, []);

  const handleDelete = useCallback(
    (editorInstance: Editor) => {
      setValue(
        ATTACHED_KNOWLEDGE_FIELD_NAME,
        toAttachedKnowledge(collectKnowledgeItems(editorInstance)),
        { shouldDirty: true }
      );
    },
    [setValue]
  );

  const { editor } = useSkillInstructionsEditor({
    content: instructionsField.value ?? "",
    isReadOnly: false,
    onUpdate: handleUpdate,
    onBlur: handleBlur,
    onDelete: handleDelete,
  });

  const handleAddKnowledge = useCallback(() => {
    if (!editor) {
      return;
    }

    // Check if there's already an empty knowledge node (in search mode).
    // If so, do nothing - clicking the button already dismissed it via handleInteractOutside.
    const { doc } = editor.state;
    let hasEmptyKnowledgeNode = false;
    doc.descendants((node) => {
      if (node.type.name === KNOWLEDGE_NODE_TYPE) {
        const selectedItems = node.attrs?.selectedItems as
          | KnowledgeItem[]
          | undefined;
        if (!selectedItems || selectedItems.length === 0) {
          hasEmptyKnowledgeNode = true;
          return false;
        }
      }
      return true;
    });

    if (hasEmptyKnowledgeNode) {
      return;
    }

    editor.chain().focus().insertKnowledgeNode().run();
  }, [editor]);

  useEffect(() => {
    if (editor && onAddKnowledge) {
      onAddKnowledge(handleAddKnowledge);
    }
  }, [editor, handleAddKnowledge, onAddKnowledge]);

  useEffect(() => {
    return () => {
      debouncedUpdate.cancel();
    };
  }, [debouncedUpdate]);

  // Set editor class based on error state (applies to ProseMirror element)
  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setOptions({
      editorProps: {
        attributes: {
          class: editorVariants({ error: displayError }),
        },
      },
    });
  }, [editor, displayError]);

  useEffect(() => {
    if (!editor || instructionsField.value === undefined) {
      return;
    }

    if (editor.isFocused) {
      return;
    }
    const currentContent = editor.getMarkdown();
    if (currentContent !== instructionsField.value) {
      setTimeout(() => {
        editor.commands.setContent(instructionsField.value, {
          emitUpdate: false,
          contentType: "markdown",
        });
      }, 0);
    }
  }, [editor, instructionsField.value]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (isInstructionDiffMode && compareVersion) {
      if (editor.storage.agentInstructionDiff?.isDiffMode) {
        editor.commands.exitDiff();
      }

      const currentText = editor.getMarkdown();
      const compareText = compareVersion.instructions ?? "";

      editor.commands.applyDiff(compareText, currentText);
      editor.setEditable(false);
    } else if (!isInstructionDiffMode) {
      if (editor.storage.agentInstructionDiff?.isDiffMode) {
        editor.commands.exitDiff();
        editor.setEditable(true);
      }
    }
  }, [isInstructionDiffMode, compareVersion, editor]);

  return (
    <div className="space-y-1 p-px">
      <SkillInstructionsEditorContent editor={editor} isReadOnly={false} />

      {instructionsFieldState.error && (
        <div className="dark:text-warning-night ml-2 text-xs text-warning">
          {instructionsFieldState.error.message}
        </div>
      )}
    </div>
  );
}
