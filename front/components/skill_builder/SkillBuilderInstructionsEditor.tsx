import { getDefaultMCPAction } from "@app/components/agent_builder/types";
import { editorVariants } from "@app/components/editor/editorStyles";
import { SKILL_NODE_TYPE } from "@app/components/editor/extensions/input_bar/SkillNode";
import type { SlashCommandSkillSuggestion } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import { CAPABILITY_SEARCH_NODE_TYPE } from "@app/components/editor/extensions/skill_builder/CapabilitySearchNode";
import { KNOWLEDGE_NODE_TYPE } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import type { KnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";
import { TOOL_NODE_TYPE } from "@app/components/editor/extensions/skill_builder/ToolNode";
import {
  SkillInstructionsEditorContent,
  useSkillInstructionsEditor,
} from "@app/components/editor/SkillInstructionsEditor";
import { CapabilityDetailsSheets } from "@app/components/shared/CapabilityDetailsSheets";
import { SKILL_BUILDER_INSTRUCTIONS_BLUR_EVENT } from "@app/components/skill_builder/events";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type {
  ReferencedSkillFormData,
  SkillBuilderFormData,
} from "@app/components/skill_builder/SkillBuilderFormContext";
import {
  type ReferenceSummaryItem,
  SkillBuilderInstructionsReferenceSummary,
} from "@app/components/skill_builder/SkillBuilderInstructionsReferenceSummary";
import { useSkillVersionComparisonContext } from "@app/components/skill_builder/SkillBuilderVersionContext";
import { useSkillSuggestions } from "@app/hooks/useSkillSuggestions";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useIsSelfImprovementAvailable } from "@app/lib/client/self_improvement";
import {
  postProcessMarkdown,
  preprocessMarkdownForEditor,
} from "@app/lib/editor/skill_instructions_preprocessing";
import {
  SKILL_TAG_NAME,
  UNAVAILABLE_SKILL_TAG_NAME,
} from "@app/lib/skills/format";
import { TOOL_TAG_NAME } from "@app/lib/tools/format";
import { isString } from "@app/types/shared/utils/general";
import { cn } from "@dust-tt/sparkle";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import type { Config } from "dompurify";
import DOMPurify from "dompurify";
import debounce from "lodash/debounce";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useController, useFormContext } from "react-hook-form";

const INSTRUCTIONS_FIELD_NAME = "instructions";
const INSTRUCTIONS_HTML_FIELD_NAME = "instructionsHtml";
const ATTACHED_KNOWLEDGE_FIELD_NAME = "attachedKnowledge";
const REFERENCED_SKILLS_FIELD_NAME = "referencedSkills";
const BASE_ALLOWED_INSTRUCTIONS_TAGS = ["knowledge"];
const BASE_ALLOWED_INSTRUCTIONS_ATTRS = ["space", "dsv", "hasChildren"];
const SKILL_REFERENCE_ALLOWED_TAGS = [
  SKILL_TAG_NAME,
  UNAVAILABLE_SKILL_TAG_NAME,
  TOOL_TAG_NAME,
];
const SKILL_REFERENCE_ALLOWED_ATTRS = ["id", "name", "icon"];

const SKILL_INSTRUCTIONS_SANITIZE_CONFIG: Config = {
  ADD_TAGS: [
    ...BASE_ALLOWED_INSTRUCTIONS_TAGS,
    ...SKILL_REFERENCE_ALLOWED_TAGS,
  ],
  ADD_ATTR: [
    ...BASE_ALLOWED_INSTRUCTIONS_ATTRS,
    ...SKILL_REFERENCE_ALLOWED_ATTRS,
  ],
  FORBID_ATTR: ["style", "class"],
};

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

function collectToolReferenceIds(editor: Editor): Set<string> {
  const toolIds = new Set<string>();

  editor.state.doc.descendants((node) => {
    if (
      node.type.name === TOOL_NODE_TYPE &&
      isString(node.attrs?.mcpServerViewId)
    ) {
      toolIds.add(node.attrs.mcpServerViewId);
    }
  });

  return toolIds;
}

function getKnowledgeReferenceId(node: ProseMirrorNode): string | null {
  const selectedItems = node.attrs.selectedItems;
  if (!Array.isArray(selectedItems)) {
    return null;
  }

  const item = selectedItems[0];
  if (!item) {
    return null;
  }

  return `${item.dataSourceViewId}:${item.nodeId}`;
}

function matchesReferenceTarget(
  node: ProseMirrorNode,
  target: ReferenceSummaryItem
): boolean {
  switch (target.kind) {
    case "knowledge":
      return (
        node.type.name === KNOWLEDGE_NODE_TYPE &&
        getKnowledgeReferenceId(node) === target.id
      );
    case "skill":
      return (
        node.type.name === SKILL_NODE_TYPE && node.attrs.skillId === target.id
      );
    case "tool":
      return (
        node.type.name === TOOL_NODE_TYPE &&
        node.attrs.mcpServerViewId === target.id
      );
  }
}

function getFirstReferencePosition(
  editor: Editor,
  target: ReferenceSummaryItem
): number | null {
  let referencePosition: number | null = null;

  editor.state.doc.descendants((node, position) => {
    if (referencePosition !== null) {
      return false;
    }

    if (matchesReferenceTarget(node, target)) {
      referencePosition = position;
      return false;
    }

    return true;
  });

  return referencePosition;
}

function scrollReferenceIntoView({
  overlayHeight,
  referenceElement,
  scrollContainer,
}: {
  overlayHeight: number;
  referenceElement: HTMLElement;
  scrollContainer: HTMLElement;
}) {
  const containerRect = scrollContainer.getBoundingClientRect();
  const referenceRect = referenceElement.getBoundingClientRect();
  const visibleHeight = Math.max(
    0,
    scrollContainer.clientHeight - overlayHeight
  );
  const referenceTop =
    referenceRect.top - containerRect.top + scrollContainer.scrollTop;

  scrollContainer.scrollTo({
    behavior: "smooth",
    top: Math.max(
      0,
      referenceTop + referenceRect.height / 2 - visibleHeight / 2
    ),
  });
}

function collectSkillReferenceIds(editor: Editor): Set<string> {
  const skillIds = new Set<string>();

  editor.state.doc.descendants((node) => {
    if (node.type.name === SKILL_NODE_TYPE && isString(node.attrs?.skillId)) {
      skillIds.add(node.attrs.skillId);
    }
  });

  return skillIds;
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

function toReferencedSkill(
  skill: SlashCommandSkillSuggestion
): ReferencedSkillFormData {
  return {
    id: skill.sId,
    name: skill.name,
    icon: skill.icon,
    requestedSpaceIds: skill.requestedSpaceIds,
  };
}

function sanitizeSkillInstructionsHtml(html: string): string {
  try {
    return DOMPurify.sanitize(html, SKILL_INSTRUCTIONS_SANITIZE_CONFIG);
  } catch {
    return html;
  }
}

const INSTRUCTIONS_EDITOR_SIZE = "min-h-60 max-h-[50vh]";
const INSTRUCTIONS_EDITOR_REFERENCE_SUMMARY_SIZE =
  "min-h-80 rounded-b-none border-b-0 pb-44";

interface SkillBuilderInstructionsEditorProps {
  onAddKnowledge?: (addKnowledge: () => void) => void;
  onOpenCapabilities?: (openCapabilities: () => void) => void;
}

export function SkillBuilderInstructionsEditor({
  onAddKnowledge,
  onOpenCapabilities,
}: SkillBuilderInstructionsEditorProps) {
  const { compareVersion, isDiffMode } = useSkillVersionComparisonContext();
  const { resetField } = useFormContext<SkillBuilderFormData>();
  const initializedAttachedKnowledgeEditorRef = useRef<Editor | null>(null);
  const instructionReferenceSummaryRef = useRef<HTMLDivElement | null>(null);
  const previousInlineToolIdsRef = useRef<Set<string>>(new Set());
  const previousInlineSkillIdsRef = useRef<Set<string>>(new Set());
  const toolsRef = useRef<SkillBuilderFormData["tools"]>([]);
  const referencedSkillsRef = useRef<SkillBuilderFormData["referencedSkills"]>(
    []
  );
  const {
    owner,
    user,
    skillId,
    selectedSuggestionId,
    setAcceptInstructionEdits,
  } = useSkillBuilderContext();
  const [selectedSkillIdForDetails, setSelectedSkillIdForDetails] = useState<
    string | null
  >(null);
  const [selectedServerViewForDetails, setSelectedServerViewForDetails] =
    useState<MCPServerViewType | null>(null);
  const hasSelfImprovement = useIsSelfImprovementAvailable();

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

  const {
    field: { onChange: onToolsChange, value: tools },
  } = useController<SkillBuilderFormData, "tools">({
    name: "tools",
  });

  const {
    field: { onChange: onReferencedSkillsChange, value: referencedSkills },
  } = useController<SkillBuilderFormData, typeof REFERENCED_SKILLS_FIELD_NAME>({
    name: REFERENCED_SKILLS_FIELD_NAME,
  });

  useEffect(() => {
    toolsRef.current = tools;
  }, [tools]);

  useEffect(() => {
    referencedSkillsRef.current = referencedSkills;
  }, [referencedSkills]);

  const displayError =
    !!instructionsFieldState.error || !!attachedKnowledgeFieldState.error;
  const hasInstructionReferenceSummary =
    (attachedKnowledgeField.value?.length ?? 0) > 0 ||
    referencedSkills.length > 0 ||
    tools.length > 0 ||
    (instructionsField.value?.includes("<knowledge ") ?? false) ||
    (instructionsField.value?.includes("<tool ") ?? false);

  const syncAttachedKnowledgeFromEditor = useCallback(
    (editor: Editor) => {
      attachedKnowledgeField.onChange(
        toAttachedKnowledge(collectKnowledgeItems(editor))
      );
    },
    [attachedKnowledgeField.onChange]
  );

  const syncInlineReferencesFromEditor = useCallback(
    (editor: Editor) => {
      const currentInlineToolIds = collectToolReferenceIds(editor);
      const removedToolIds = [...previousInlineToolIdsRef.current].filter(
        (toolId) => !currentInlineToolIds.has(toolId)
      );

      if (removedToolIds.length > 0) {
        const removedToolIdsSet = new Set(removedToolIds);
        const nextTools = toolsRef.current.filter(
          (tool) => !removedToolIdsSet.has(tool.configuration.mcpServerViewId)
        );
        toolsRef.current = nextTools;
        onToolsChange(nextTools);
      }

      previousInlineToolIdsRef.current = currentInlineToolIds;

      const currentInlineSkillIds = collectSkillReferenceIds(editor);
      const removedSkillIds = [...previousInlineSkillIdsRef.current].filter(
        (skillId) => !currentInlineSkillIds.has(skillId)
      );

      if (removedSkillIds.length > 0) {
        const removedSkillIdsSet = new Set(removedSkillIds);
        const nextReferencedSkills = referencedSkillsRef.current.filter(
          (skill) => !removedSkillIdsSet.has(skill.id)
        );
        referencedSkillsRef.current = nextReferencedSkills;
        onReferencedSkillsChange(nextReferencedSkills);
      }

      previousInlineSkillIdsRef.current = currentInlineSkillIds;
    },
    [onReferencedSkillsChange, onToolsChange]
  );

  const syncInstructionsFromEditor = useCallback(
    (editor: Editor) => {
      instructionsField.onChange(
        postProcessMarkdown(editor.getMarkdown()).trim()
      );
      instructionsHtmlField.onChange(
        sanitizeSkillInstructionsHtml(editor.getHTML())
      );
      syncAttachedKnowledgeFromEditor(editor);
      syncInlineReferencesFromEditor(editor);
    },
    [
      instructionsField.onChange,
      instructionsHtmlField.onChange,
      syncAttachedKnowledgeFromEditor,
      syncInlineReferencesFromEditor,
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
        syncInlineReferencesFromEditor(editor);
        debouncedUpdate(editor);
      }
    },
    [debouncedUpdate, syncInlineReferencesFromEditor]
  );

  const handleBlur = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent(SKILL_BUILDER_INSTRUCTIONS_BLUR_EVENT)
    );
  }, []);

  const handleDelete = useCallback(
    (editorInstance: Editor) => {
      syncAttachedKnowledgeFromEditor(editorInstance);
      syncInlineReferencesFromEditor(editorInstance);
    },
    [syncAttachedKnowledgeFromEditor, syncInlineReferencesFromEditor]
  );

  const handleSelectToolReference = useCallback(
    (view: MCPServerViewType) => {
      const alreadyAdded = toolsRef.current.some(
        (tool) => tool.configuration.mcpServerViewId === view.sId
      );

      if (alreadyAdded) {
        return;
      }

      const nextTools = [...toolsRef.current, getDefaultMCPAction(view)];
      toolsRef.current = nextTools;
      onToolsChange(nextTools);
    },
    [onToolsChange]
  );

  const handleSelectSkillReference = useCallback(
    (skill: SlashCommandSkillSuggestion) => {
      const alreadyAdded = referencedSkillsRef.current.some(
        (referencedSkill) => referencedSkill.id === skill.sId
      );

      if (!alreadyAdded) {
        const nextReferencedSkills = [
          ...referencedSkillsRef.current,
          toReferencedSkill(skill),
        ];
        referencedSkillsRef.current = nextReferencedSkills;
        onReferencedSkillsChange(nextReferencedSkills);
      }
    },
    [onReferencedSkillsChange]
  );

  const handleSkillDetails = useCallback(
    (skill: SlashCommandSkillSuggestion) => {
      setSelectedSkillIdForDetails(skill.sId);
    },
    []
  );

  const handleToolDetails = useCallback((tool: MCPServerViewType) => {
    setSelectedServerViewForDetails(tool);
  }, []);

  const { suggestions, isSuggestionsLoading } = useSkillSuggestions({
    skillId,
    states: ["pending"],
    workspaceId: owner.sId,
    disabled: !skillId || !hasSelfImprovement,
  });

  const hasSuggestions = suggestions.length > 0;

  const { editor, isContentReady } = useSkillInstructionsEditor({
    content: instructionsField.value ?? "",
    htmlContent: instructionsHtmlField.value ?? undefined,
    isReadOnly: hasSuggestions,
    skillReferences: {
      currentSkillId: skillId,
      onSkillDetails: handleSkillDetails,
      onSkillNodeDetails: setSelectedSkillIdForDetails,
      onSelectSkill: handleSelectSkillReference,
      onSelectTool: handleSelectToolReference,
      onToolDetails: handleToolDetails,
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

  const handleOpenCapabilities = useCallback(() => {
    if (!editor) {
      return;
    }

    let hasEmptyCapabilitySearchNode = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === CAPABILITY_SEARCH_NODE_TYPE) {
        hasEmptyCapabilitySearchNode = true;
        return false;
      }
      return true;
    });

    if (hasEmptyCapabilitySearchNode) {
      return;
    }

    editor.chain().focus().insertCapabilitySearchNode().run();
  }, [editor]);

  const handleReferenceClick = useCallback(
    (target: ReferenceSummaryItem) => {
      if (!editor || editor.isDestroyed) {
        return;
      }

      const referencePosition = getFirstReferencePosition(editor, target);
      if (referencePosition === null) {
        return;
      }

      const referenceDocNode = editor.state.doc.nodeAt(referencePosition);
      if (!referenceDocNode) {
        return;
      }

      const referenceNode = editor.view.nodeDOM(referencePosition);
      editor.commands.focus(referencePosition + referenceDocNode.nodeSize);

      const referenceElement =
        referenceNode instanceof HTMLElement
          ? referenceNode
          : referenceNode?.parentElement;
      if (!referenceElement) {
        return;
      }

      requestAnimationFrame(() => {
        if (editor.isDestroyed) {
          return;
        }

        scrollReferenceIntoView({
          overlayHeight:
            instructionReferenceSummaryRef.current?.getBoundingClientRect()
              .height ?? 0,
          referenceElement,
          scrollContainer: editor.view.dom,
        });
      });
    },
    [editor]
  );

  useEffect(() => {
    if (editor && onOpenCapabilities) {
      onOpenCapabilities(handleOpenCapabilities);
    }
  }, [editor, handleOpenCapabilities, onOpenCapabilities]);

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
    previousInlineToolIdsRef.current = collectToolReferenceIds(editor);
    previousInlineSkillIdsRef.current = collectSkillReferenceIds(editor);
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
            hasInstructionReferenceSummary &&
              INSTRUCTIONS_EDITOR_REFERENCE_SUMMARY_SIZE
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
    const currentHtml = sanitizeSkillInstructionsHtml(editor.getHTML());
    if (currentHtml !== incomingHtml) {
      editor.commands.setContent(incomingHtml, { emitUpdate: false });
    }
  }, [editor, isDiffMode, instructionsHtmlField.value]);

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

        if (instructionsHtmlField.value) {
          editor.commands.setContent(instructionsHtmlField.value, {
            emitUpdate: false,
          });
        } else {
          editor.commands.setContent(
            preprocessMarkdownForEditor(instructionsField.value ?? ""),
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
    instructionsField.value,
    instructionsHtmlField.value,
  ]);

  return (
    <>
      <div className="space-y-1 p-px">
        <div className="group relative overflow-hidden rounded-xl">
          <SkillInstructionsEditorContent
            editor={editor}
            isReadOnly={hasSuggestions}
          />
          <SkillBuilderInstructionsReferenceSummary
            attachedKnowledge={attachedKnowledgeField.value}
            containerRef={instructionReferenceSummaryRef}
            hasError={displayError}
            instructions={instructionsField.value ?? ""}
            onReferenceClick={handleReferenceClick}
            referencedSkills={referencedSkills}
            tools={tools}
          />
        </div>

        {instructionsFieldState.error && (
          <div className="dark:text-warning-night ml-2 text-xs text-warning">
            {instructionsFieldState.error.message}
          </div>
        )}
      </div>

      <CapabilityDetailsSheets
        owner={owner}
        user={user}
        selectedSkillId={selectedSkillIdForDetails}
        selectedMCPServerView={selectedServerViewForDetails}
        onCloseSkill={() => setSelectedSkillIdForDetails(null)}
        onCloseTool={() => setSelectedServerViewForDetails(null)}
      />
    </>
  );
}
