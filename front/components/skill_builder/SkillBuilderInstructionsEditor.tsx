import { AttachmentIcon, Button } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { cva } from "class-variance-authority";
import debounce from "lodash/debounce";
import { useCallback, useEffect, useMemo } from "react";
import { useController } from "react-hook-form";

import type { KnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import { KNOWLEDGE_NODE_TYPE } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import { useSkillInstructionsExtensions } from "@app/components/editor/SkillInstructionsEditor";
import { SKILL_BUILDER_INSTRUCTIONS_BLUR_EVENT } from "@app/components/skill_builder/events";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import type { SkillType } from "@app/types/assistant/skill_configuration";

const editorVariants = cva(
  [
    "overflow-auto border rounded-xl px-3 py-2 resize-y min-h-60 max-h-[1024px]",
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
}

export function SkillBuilderInstructionsEditor({
  compareVersion,
  isInstructionDiffMode = false,
}: SkillBuilderInstructionsEditorProps) {
  const { field: instructionsField, fieldState: instructionsFieldState } =
    useController<SkillBuilderFormData, "instructions">({
      name: "instructions",
    });
  const {
    field: attachedKnowledgeField,
    fieldState: attachedKnowledgeFieldState,
  } = useController<SkillBuilderFormData, "attachedKnowledge">({
    name: "attachedKnowledge",
  });

  const displayError =
    !!instructionsFieldState.error || !!attachedKnowledgeFieldState.error;

  // Helper function to extract attached knowledge and update form.
  const extractAttachedKnowledge = useCallback((editor: Editor) => {
    const knowledgeItems: KnowledgeItem[] = [];

    // Use TipTap's document traversal API to recursively find all knowledge nodes.
    // Note: $nodes() only searches top-level nodes, not nested inline nodes.
    const { state } = editor;
    const { doc } = state;

    doc.descendants((node) => {
      if (node.type.name === KNOWLEDGE_NODE_TYPE && node.attrs?.selectedItems) {
        const selectedItems = node.attrs.selectedItems as KnowledgeItem[];
        knowledgeItems.push(...selectedItems);
      }
    });

    return knowledgeItems;
  }, []);

  // Update form whenever attached knowledge changes.
  const updateAttachedKnowledge = useCallback(
    (editor: Editor) => {
      const attachedKnowledge = extractAttachedKnowledge(editor);

      // Transform for form storage.
      const transformedAttachments = attachedKnowledge.map((item) => ({
        dataSourceViewId: item.dataSourceViewId,
        nodeId: item.nodeId, // This is the node ID from the data source view content node.
        spaceId: item.spaceId,
        title: item.label,
      }));

      attachedKnowledgeField.onChange(transformedAttachments);
    },
    [extractAttachedKnowledge, attachedKnowledgeField]
  );

  const extensions = useSkillInstructionsExtensions(false);

  const debouncedUpdate = useMemo(
    () =>
      debounce((editor: Editor) => {
        if (!isInstructionDiffMode && !editor.isDestroyed) {
          instructionsField.onChange(editor.getMarkdown());

          // Also update attached knowledge in the form.
          updateAttachedKnowledge(editor);
        }
      }, 250),
    [instructionsField, isInstructionDiffMode, updateAttachedKnowledge]
  );

  const editor = useEditor(
    {
      extensions,
      content: instructionsField.value || undefined, // display placeholder if instructions are empty
      contentType: "markdown",
      onUpdate: ({ editor, transaction }) => {
        if (transaction.docChanged) {
          debouncedUpdate(editor);
        }
      },
      onBlur: () => {
        window.dispatchEvent(
          new CustomEvent(SKILL_BUILDER_INSTRUCTIONS_BLUR_EVENT)
        );
      },
      onDelete: ({ editor }) => {
        // Ensure attached knowledge is updated on node deletion.
        updateAttachedKnowledge(editor);
      },
      immediatelyRender: false,
    },
    [extensions]
  );

  const handleAddKnowledge = useCallback(() => {
    if (editor) {
      editor.chain().focus().insertKnowledgeNode().run();
    }
  }, [editor]);

  useEffect(() => {
    return () => {
      debouncedUpdate.cancel();
    };
  }, [debouncedUpdate]);

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
    } else if (!isInstructionDiffMode && editor) {
      if (editor.storage.agentInstructionDiff?.isDiffMode) {
        editor.commands.exitDiff();
        editor.setEditable(true);
      }
    }
  }, [isInstructionDiffMode, compareVersion, editor]);

  return (
    <div className="relative space-y-1 p-px">
      <EditorContent editor={editor} className="leading-7" />

      {/* Floating Add Knowledge Button */}
      <Button
        size="xs"
        variant="ghost"
        icon={AttachmentIcon}
        onClick={handleAddKnowledge}
        className="absolute bottom-2 left-2"
        tooltip="Add knowledge"
        disabled={!editor}
      />

      {instructionsFieldState.error && (
        <div className="dark:text-warning-night ml-2 text-xs text-warning">
          {instructionsFieldState.error.message}
        </div>
      )}
    </div>
  );
}
