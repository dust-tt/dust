import { editorVariants } from "@app/components/editor/editorStyles";
import { KNOWLEDGE_NODE_TYPE } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import type { KnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";
import { stripHtmlAttributes } from "@app/components/editor/input_bar/cleanupPastedHTML";
import {
  SkillInstructionsEditorContent,
  useSkillInstructionsEditor,
} from "@app/components/editor/SkillInstructionsEditor";
import { SKILL_BUILDER_INSTRUCTIONS_BLUR_EVENT } from "@app/components/skill_builder/events";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { useSkillVersionComparisonContext } from "@app/components/skill_builder/SkillBuilderVersionContext";
import { useSkillSuggestions } from "@app/hooks/useSkillSuggestions";
import {
  postProcessMarkdown,
  preprocessMarkdownForEditor,
} from "@app/lib/editor/skill_instructions_preprocessing";
import { cn } from "@dust-tt/sparkle";
import type { Transaction } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import debounce from "lodash/debounce";
import { useCallback, useEffect, useMemo } from "react";
import { useController, useFormContext } from "react-hook-form";

const INSTRUCTIONS_FIELD_NAME = "instructions";
const INSTRUCTIONS_HTML_FIELD_NAME = "instructionsHtml";
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

const INSTRUCTIONS_EDITOR_SIZE = "min-h-60 max-h-[1024px]";

interface SkillBuilderInstructionsEditorProps {
  onAddKnowledge?: (addKnowledge: () => void) => void;
}

export function SkillBuilderInstructionsEditor({
  onAddKnowledge,
}: SkillBuilderInstructionsEditorProps) {
  const { compareVersion, isDiffMode } = useSkillVersionComparisonContext();
  const { setValue } = useFormContext<SkillBuilderFormData>();

  const { field: instructionsField, fieldState: instructionsFieldState } =
    useController<SkillBuilderFormData, typeof INSTRUCTIONS_FIELD_NAME>({
      name: INSTRUCTIONS_FIELD_NAME,
    });

  const { field: instructionsHtmlField } = useController<
    SkillBuilderFormData,
    typeof INSTRUCTIONS_HTML_FIELD_NAME
  >({
    name: INSTRUCTIONS_HTML_FIELD_NAME,
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
        if (!isDiffMode && !editor.isDestroyed) {
          setValue(
            INSTRUCTIONS_FIELD_NAME,
            postProcessMarkdown(editor.getMarkdown()).trim(),
            { shouldDirty: true }
          );
          setValue(
            INSTRUCTIONS_HTML_FIELD_NAME,
            stripHtmlAttributes(editor.getHTML()),
            { shouldDirty: true }
          );
          setValue(
            ATTACHED_KNOWLEDGE_FIELD_NAME,
            toAttachedKnowledge(collectKnowledgeItems(editor)),
            { shouldDirty: true }
          );
        }
      }, 250),
    [isDiffMode, setValue]
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

  const { owner, skillId, selectedSuggestionId, setAcceptInstructionEdits } =
    useSkillBuilderContext();
  const { suggestions, isSuggestionsLoading } = useSkillSuggestions({
    skillId,
    states: ["pending"],
    workspaceId: owner.sId,
    disabled: !skillId,
  });

  const hasSuggestions = suggestions.length > 0;

  const { editor, isContentReady } = useSkillInstructionsEditor({
    content: instructionsField.value ?? "",
    htmlContent: instructionsHtmlField.value ?? undefined,
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

  // Register a callback that the suggestions panel can call to accept a
  // suggestion directly via the editor's ProseMirror commands.
  // Accepting the ProseMirror suggestion means we don't need to manipulate the HTML by hand again
  // as we already did it to create the suggestion in ProseMirror.
  useEffect(() => {
    if (!editor) {
      setAcceptInstructionEdits(null);
      return;
    }

    // Wrap in arrow to avoid React treating the function as a state updater.
    setAcceptInstructionEdits(() => (suggestionSId: string) => {
      // Accept each edit of this suggestion via the PM command.
      for (let i = 0; ; i++) {
        const editId = `${suggestionSId}:${i}`;
        const accepted = editor.commands.acceptSuggestion(editId);
        if (!accepted) {
          break;
        }
      }

      // Sync the editor's new content back to the form.
      setValue(
        INSTRUCTIONS_HTML_FIELD_NAME,
        stripHtmlAttributes(editor.getHTML()),
        { shouldDirty: true }
      );
      setValue(
        INSTRUCTIONS_FIELD_NAME,
        postProcessMarkdown(editor.getMarkdown()).trim(),
        {
          shouldDirty: true,
        }
      );
    });

    return () => {
      setAcceptInstructionEdits(null);
    };
  }, [editor, setValue, setAcceptInstructionEdits]);

  // Apply pending instruction suggestions as inline diff decorations.
  // "Reject all + re-apply current" on every change so that accepts and
  // rejects from the suggestions panel are immediately reflected.
  // Wait for isContentReady to be true so there is content on which the diff must be applied
  useEffect(() => {
    if (!editor || isSuggestionsLoading || !isContentReady) {
      return;
    }

    editor.commands.rejectAllSuggestions();

    for (const suggestion of suggestions) {
      const { instructionEdits } = suggestion.suggestion;
      if (!instructionEdits || instructionEdits.length === 0) {
        continue;
      }
      for (let i = 0; i < instructionEdits.length; i++) {
        const edit = instructionEdits[i];
        editor.commands.applySuggestion({
          id: `${suggestion.sId}:${i}`,
          targetBlockId: edit.targetBlockId,
          content: edit.content,
        });
      }
    }

    // Highlight all edits of the selected suggestion using prefix matching.
    // may be null if no suggestion is selected
    editor.commands.setHighlightedSuggestion(selectedSuggestionId);

    // Make the editor read-only while suggestion diffs are displayed.
    if (!isDiffMode) {
      editor.setEditable(!hasSuggestions);
    }
  }, [
    editor,
    isContentReady,
    suggestions,
    isSuggestionsLoading,
    selectedSuggestionId,
    isDiffMode,
    hasSuggestions,
  ]);

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
          class: cn(
            editorVariants({
              error: displayError,
              disabled: isDiffMode || hasSuggestions,
            }),
            INSTRUCTIONS_EDITOR_SIZE
          ),
        },
      },
    });
  }, [editor, displayError, isDiffMode, hasSuggestions]);

  // Sync external changes to the editor content
  useEffect(() => {
    if (!editor || !instructionsHtmlField.value) {
      return;
    }

    // Skip if the editor or any of its node views (e.g. knowledge search input)
    // currently have focus — the editor itself is the source of this change.
    if (
      editor.isFocused ||
      // KnowledgeSearchComponent is a sibling of the editor view in the DOM
      editor.view.dom.parentElement?.contains(document.activeElement)
    ) {
      return;
    }

    const incomingHtml = instructionsHtmlField.value;
    const currentHtml = stripHtmlAttributes(editor.getHTML());
    if (currentHtml !== incomingHtml) {
      editor.commands.setContent(incomingHtml, { emitUpdate: false });
    }
  }, [editor, instructionsHtmlField.value]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (compareVersion) {
      if (editor.storage.agentInstructionDiff?.isDiffMode) {
        editor.commands.exitDiff();
      }

      const compareText = compareVersion.instructions ?? "";
      const currentText = instructionsField.value ?? "";

      editor.commands.setContent(preprocessMarkdownForEditor(currentText), {
        emitUpdate: false,
        contentType: "markdown",
      });
      editor.commands.applyDiff(
        preprocessMarkdownForEditor(compareText),
        preprocessMarkdownForEditor(currentText)
      );
      editor.setEditable(false);
    } else if (editor.storage.agentInstructionDiff?.isDiffMode) {
      editor.commands.exitDiff();
      editor.setEditable(true);
    }
    // Re-run when instructionsField.value changes so that restoring a single
    // field updates the diff overlay.
  }, [compareVersion, editor, instructionsField.value]);

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
