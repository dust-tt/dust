import { editorVariants } from "@app/components/editor/editorStyles";
import { KNOWLEDGE_NODE_TYPE } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import type { KnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";
import {
  SkillInstructionsEditorContent,
  useSkillInstructionsEditor,
} from "@app/components/editor/SkillInstructionsEditor";
import { SKILL_BUILDER_INSTRUCTIONS_BLUR_EVENT } from "@app/components/skill_builder/events";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { SkillBuilderInstructionsReferenceSummary } from "@app/components/skill_builder/SkillBuilderInstructionsReferenceSummary";
import { useSkillVersionComparisonContext } from "@app/components/skill_builder/SkillBuilderVersionContext";
import { useSkillSuggestions } from "@app/hooks/useSkillSuggestions";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import {
  postProcessMarkdown,
  preprocessMarkdownForEditor,
} from "@app/lib/editor/skill_instructions_preprocessing";
import { cn } from "@dust-tt/sparkle";
import type { Transaction } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import type { Config } from "dompurify";
import DOMPurify from "dompurify";
import debounce from "lodash/debounce";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";

const INSTRUCTIONS_FIELD_NAME = "instructions";
const INSTRUCTIONS_HTML_FIELD_NAME = "instructionsHtml";
const ATTACHED_KNOWLEDGE_FIELD_NAME = "attachedKnowledge";
const BASE_ALLOWED_INSTRUCTIONS_TAGS = ["knowledge"];
const BASE_ALLOWED_INSTRUCTIONS_ATTRS = ["space", "dsv", "hasChildren"];
const SKILL_REFERENCE_ALLOWED_TAGS = ["skill", "tool"];
const SKILL_REFERENCE_ALLOWED_ATTRS = ["id", "name", "icon"];

function getSkillInstructionsSanitizeConfig({
  enableSkillReferences,
}: {
  enableSkillReferences: boolean;
}): Config {
  return {
    ADD_TAGS: enableSkillReferences
      ? [...BASE_ALLOWED_INSTRUCTIONS_TAGS, ...SKILL_REFERENCE_ALLOWED_TAGS]
      : [...BASE_ALLOWED_INSTRUCTIONS_TAGS],
    ADD_ATTR: enableSkillReferences
      ? [...BASE_ALLOWED_INSTRUCTIONS_ATTRS, ...SKILL_REFERENCE_ALLOWED_ATTRS]
      : [...BASE_ALLOWED_INSTRUCTIONS_ATTRS],
    FORBID_ATTR: ["style", "class"],
  };
}

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

function sanitizeSkillInstructionsHtml(
  html: string,
  { enableSkillReferences = false }: { enableSkillReferences?: boolean } = {}
): string {
  try {
    return DOMPurify.sanitize(
      html,
      getSkillInstructionsSanitizeConfig({ enableSkillReferences })
    );
  } catch {
    return html;
  }
}

const INSTRUCTIONS_EDITOR_SIZE = "min-h-60 max-h-[1024px]";

interface SkillBuilderInstructionsEditorProps {
  onAddKnowledge?: (addKnowledge: () => void) => void;
}

export function SkillBuilderInstructionsEditor({
  onAddKnowledge,
}: SkillBuilderInstructionsEditorProps) {
  const { compareVersion, isDiffMode } = useSkillVersionComparisonContext();
  const { control, resetField } = useFormContext<SkillBuilderFormData>();
  const initializedAttachedKnowledgeEditorRef = useRef<Editor | null>(null);
  const { owner, skillId, selectedSuggestionId, setAcceptInstructionEdits } =
    useSkillBuilderContext();
  const { hasFeature } = useFeatureFlags();
  const hasReinforcementFeature =
    hasFeature("reinforced_agents") && hasFeature("reinforcement_ui");
  const enableSkillReferences = hasFeature("nested_skills");

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

  const {
    field: attachedKnowledgeField,
    fieldState: attachedKnowledgeFieldState,
  } = useController<SkillBuilderFormData, typeof ATTACHED_KNOWLEDGE_FIELD_NAME>(
    {
      name: ATTACHED_KNOWLEDGE_FIELD_NAME,
    }
  );
  const tools = useWatch({ control, name: "tools" }) ?? [];

  const displayError =
    !!instructionsFieldState.error || !!attachedKnowledgeFieldState.error;
  const hasInstructionReferenceSummary =
    enableSkillReferences &&
    ((attachedKnowledgeField.value?.length ?? 0) > 0 ||
      tools.length > 0 ||
      (instructionsField.value?.includes("<knowledge ") ?? false) ||
      (instructionsField.value?.includes("<skill ") ?? false) ||
      (instructionsField.value?.includes("<tool ") ?? false));

  const syncAttachedKnowledgeFromEditor = useCallback(
    (editor: Editor) => {
      attachedKnowledgeField.onChange(
        toAttachedKnowledge(collectKnowledgeItems(editor))
      );
    },
    [attachedKnowledgeField.onChange]
  );

  const syncInstructionsFromEditor = useCallback(
    (editor: Editor) => {
      instructionsField.onChange(
        postProcessMarkdown(editor.getMarkdown()).trim()
      );
      instructionsHtmlField.onChange(
        sanitizeSkillInstructionsHtml(editor.getHTML(), {
          enableSkillReferences,
        })
      );
      syncAttachedKnowledgeFromEditor(editor);
    },
    [
      enableSkillReferences,
      instructionsField.onChange,
      instructionsHtmlField.onChange,
      syncAttachedKnowledgeFromEditor,
    ]
  );

  const debouncedUpdate = useMemo(
    () =>
      debounce((editor: Editor) => {
        if (!isDiffMode && !editor.isDestroyed) {
          syncInstructionsFromEditor(editor);
        }
      }, 250),
    [isDiffMode, syncInstructionsFromEditor]
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
      syncAttachedKnowledgeFromEditor(editorInstance);
    },
    [syncAttachedKnowledgeFromEditor]
  );

  const { suggestions, isSuggestionsLoading } = useSkillSuggestions({
    skillId,
    states: ["pending"],
    workspaceId: owner.sId,
    disabled: !skillId || !hasReinforcementFeature,
  });

  const hasSuggestions = suggestions.length > 0;

  const { editor, isContentReady } = useSkillInstructionsEditor({
    content: instructionsField.value ?? "",
    htmlContent: instructionsHtmlField.value ?? undefined,
    isReadOnly: hasSuggestions,
    skillReferences: {
      currentSkillId: skillId,
      enableSkillReferences,
      owner,
    },
    onUpdate: handleUpdate,
    onBlur: handleBlur,
    onDelete: handleDelete,
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return;
    }

    // This allows RHF to focus this custom editor when validation fails.
    instructionsField.ref(editor.view.dom);
    attachedKnowledgeField.ref(editor.view.dom);

    return () => {
      instructionsField.ref(null);
      attachedKnowledgeField.ref(null);
    };
  }, [attachedKnowledgeField.ref, editor, instructionsField.ref]);

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

      syncInstructionsFromEditor(editor);
    });

    return () => {
      setAcceptInstructionEdits(null);
    };
  }, [editor, syncInstructionsFromEditor, setAcceptInstructionEdits]);

  useEffect(() => {
    if (
      !editor ||
      !isContentReady ||
      isDiffMode ||
      initializedAttachedKnowledgeEditorRef.current === editor
    ) {
      return;
    }

    initializedAttachedKnowledgeEditorRef.current = editor;
    resetField(ATTACHED_KNOWLEDGE_FIELD_NAME, {
      defaultValue: toAttachedKnowledge(collectKnowledgeItems(editor)),
      keepError: true,
      keepTouched: true,
    });
  }, [editor, isContentReady, isDiffMode, resetField]);

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

    // Scroll the editor to the first edit of the selected suggestion.
    if (selectedSuggestionId) {
      requestAnimationFrame(() => {
        const firstEdit = editor.view.dom.querySelector(
          `[data-suggestion-id^="${selectedSuggestionId}:"]`
        );
        firstEdit?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

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
              disabled: isDiffMode,
              readOnly: hasSuggestions,
            }),
            INSTRUCTIONS_EDITOR_SIZE,
            hasInstructionReferenceSummary && "pb-36"
          ),
        },
      },
    });
  }, [
    editor,
    displayError,
    isDiffMode,
    hasSuggestions,
    hasInstructionReferenceSummary,
  ]);

  // Sync external changes to the editor content
  useEffect(() => {
    if (!editor || isDiffMode || !instructionsHtmlField.value) {
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
    const currentHtml = sanitizeSkillInstructionsHtml(editor.getHTML(), {
      enableSkillReferences,
    });
    if (currentHtml !== incomingHtml) {
      editor.commands.setContent(incomingHtml, { emitUpdate: false });
    }
  }, [editor, enableSkillReferences, isDiffMode, instructionsHtmlField.value]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      if (!editor || editor.isDestroyed) {
        return;
      }

      if (compareVersion) {
        if (editor.storage.agentInstructionDiff?.isDiffMode) {
          editor.commands.exitDiff();
        }

        const compareText = compareVersion.instructions ?? "";
        const currentText = instructionsField.value ?? "";

        editor.commands.setContent(
          preprocessMarkdownForEditor(currentText, {
            enableSkillReferences,
          }),
          {
            emitUpdate: false,
            contentType: "markdown",
          }
        );
        editor.commands.applyDiff(
          preprocessMarkdownForEditor(compareText, {
            enableSkillReferences,
          }),
          preprocessMarkdownForEditor(currentText, {
            enableSkillReferences,
          })
        );
        editor.setEditable(false);
      } else if (editor.storage.agentInstructionDiff?.isDiffMode) {
        editor.commands.exitDiff();
        editor.setEditable(true);

        if (instructionsHtmlField.value) {
          editor.commands.setContent(instructionsHtmlField.value, {
            emitUpdate: false,
          });
        } else {
          editor.commands.setContent(
            preprocessMarkdownForEditor(instructionsField.value ?? "", {
              enableSkillReferences,
            }),
            {
              emitUpdate: false,
              contentType: "markdown",
            }
          );
        }
      }
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
    // Re-run when instructionsField.value changes so that restoring a single
    // field updates the diff overlay.
  }, [
    compareVersion,
    editor,
    enableSkillReferences,
    instructionsField.value,
    instructionsHtmlField.value,
  ]);

  return (
    <div className="space-y-1 p-px">
      <div className="relative overflow-hidden rounded-xl">
        <SkillInstructionsEditorContent
          editor={editor}
          isReadOnly={hasSuggestions}
        />
        {enableSkillReferences && (
          <SkillBuilderInstructionsReferenceSummary
            attachedKnowledge={attachedKnowledgeField.value}
            instructions={instructionsField.value ?? ""}
            tools={tools}
          />
        )}
      </div>

      {instructionsFieldState.error && (
        <div className="dark:text-warning-night ml-2 text-xs text-warning">
          {instructionsFieldState.error.message}
        </div>
      )}
    </div>
  );
}
