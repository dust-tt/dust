import { AgentInstructionDiffExtension } from "@app/components/editor/extensions/agent_builder/AgentInstructionDiffExtension";
import {
  isInsertKnowledgeSlashCommand,
  isSkillSlashCommand,
  isToolSlashCommand,
  type SlashCommandSkillSuggestion,
} from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import type { CapabilitySearchNodeOptions } from "@app/components/editor/extensions/skill_builder/CapabilitySearchNodeView";
import { CapabilitySearchNodeWithView } from "@app/components/editor/extensions/skill_builder/CapabilitySearchNodeWithView";
import { KNOWLEDGE_NODE_TYPE } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import type { KnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";
import { SlashCommandExtension } from "@app/components/editor/extensions/skill_builder/SlashCommandExtension";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  buildSkillInstructionsExtensions,
  INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT,
} from "@app/lib/editor/build_skill_instructions_extensions";
import { preprocessMarkdownForEditor } from "@app/lib/editor/skill_instructions_preprocessing";
import type { LightWorkspaceType } from "@app/types/user";
import { cn } from "@dust-tt/sparkle";
import type { Range } from "@tiptap/core";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import type { Transaction } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";

function useEditorService(editor: Editor | null) {
  return useMemo(() => {
    return {
      getMarkdown() {
        return editor?.getMarkdown() ?? "";
      },

      getKnowledgeItems(): KnowledgeItem[] {
        if (!editor) {
          return [];
        }

        const items: KnowledgeItem[] = [];
        editor.state.doc.descendants((node) => {
          if (node.type.name === KNOWLEDGE_NODE_TYPE) {
            const selectedItems = node.attrs.selectedItems as KnowledgeItem[];
            if (selectedItems && selectedItems.length > 0) {
              items.push(...selectedItems);
            }
          }
        });
        return items;
      },

      setContent(content: string) {
        // Safety check for Safari: ensure editor and docView are available
        if (editor && !editor.isDestroyed) {
          editor.commands.setContent(preprocessMarkdownForEditor(content), {
            emitUpdate: false,
            contentType: "markdown",
          });
        }
      },

      setEditable(editable: boolean) {
        editor?.setEditable(editable);
      },

      setClass(className: string) {
        editor?.setOptions({
          editorProps: {
            attributes: {
              class: className,
            },
          },
        });
      },

      applyDiff(oldText: string, newText: string) {
        editor?.commands.applyDiff(oldText, newText);
      },

      exitDiff() {
        editor?.commands.exitDiff();
      },

      isDiffMode() {
        return editor?.storage.agentInstructionDiff?.isDiffMode ?? false;
      },

      isFocused() {
        return editor?.isFocused ?? false;
      },

      isDestroyed() {
        return editor?.isDestroyed ?? true;
      },
    };
  }, [editor]);
}

interface SkillInstructionsSkillReferencesOptions {
  currentSkillId?: string | null;
  onSelectSkill?: (skill: SlashCommandSkillSuggestion) => void;
  onSelectTool?: (tool: MCPServerViewType) => void;
  onSkillDetails?: (skill: SlashCommandSkillSuggestion) => void;
  onSkillNodeDetails?: (skillId: string) => void;
  onToolDetails?: (tool: MCPServerViewType) => void;
  owner?: LightWorkspaceType;
}

interface UseSkillInstructionsEditorProps {
  content: string;
  htmlContent?: string;
  isReadOnly: boolean;
  skillReferences?: SkillInstructionsSkillReferencesOptions;
  onUpdate?: (props: { editor: Editor; transaction: Transaction }) => void;
  onBlur?: () => void;
  onDelete?: (editor: Editor) => void;
}

function buildSkillInstructionsEditableExtensions({
  capabilitySearchOptions,
  currentSkillIdRef,
  onSelectRef,
  onSkillDetailsRef,
  onToolDetailsRef,
  owner,
}: {
  capabilitySearchOptions: CapabilitySearchNodeOptions;
  currentSkillIdRef: React.RefObject<string | null>;
  onSelectRef: React.RefObject<
    ((item: SlashCommand, editor: Editor, range: Range) => void) | undefined
  >;
  onSkillDetailsRef: React.RefObject<
    ((skill: SlashCommandSkillSuggestion) => void) | undefined
  >;
  onToolDetailsRef: React.RefObject<
    ((tool: MCPServerViewType) => void) | undefined
  >;
  owner?: LightWorkspaceType;
}) {
  return [
    CapabilitySearchNodeWithView.configure(capabilitySearchOptions),
    SlashCommandExtension.configure({
      currentSkillIdRef,
      onSelectRef,
      onSkillDetailsRef,
      onToolDetailsRef,
      owner,
    }),
    AgentInstructionDiffExtension,
    Placeholder.configure({
      placeholder: "What does this skill do? How should it behave?",
      emptyNodeClass:
        "first:before:text-gray-400 first:before:italic first:before:content-[attr(data-placeholder)] first:before:pointer-events-none first:before:absolute",
    }),
    CharacterCount.configure({
      limit: INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT,
    }),
  ];
}

export function useSkillInstructionsEditor({
  content,
  htmlContent,
  isReadOnly,
  skillReferences,
  onUpdate,
  onBlur,
  onDelete,
}: UseSkillInstructionsEditorProps) {
  const currentSkillId = skillReferences?.currentSkillId ?? null;
  const onSelectSkill = skillReferences?.onSelectSkill;
  const onSelectTool = skillReferences?.onSelectTool;
  const onSkillDetails = skillReferences?.onSkillDetails;
  const onSkillNodeDetails = skillReferences?.onSkillNodeDetails;
  const onToolDetails = skillReferences?.onToolDetails;
  const owner = skillReferences?.owner;
  const onSelectRef = useRef<
    ((item: SlashCommand, editor: Editor, range: Range) => void) | undefined
  >(undefined);
  const currentSkillIdRef = useRef<string | null>(currentSkillId);
  currentSkillIdRef.current = currentSkillId;
  const onSelectSkillRef = useRef(onSelectSkill);
  const onSelectToolRef = useRef(onSelectTool);
  const onSkillDetailsRef = useRef(onSkillDetails);
  const onToolDetailsRef = useRef(onToolDetails);
  onSelectSkillRef.current = onSelectSkill;
  onSelectToolRef.current = onSelectTool;
  onSkillDetailsRef.current = onSkillDetails;
  onToolDetailsRef.current = onToolDetails;

  const editableExtensions = useMemo(
    () =>
      buildSkillInstructionsEditableExtensions({
        capabilitySearchOptions: {
          currentSkillId,
          onSelectSkillRef,
          onSelectToolRef,
          onSkillDetailsRef,
          onToolDetailsRef,
          owner,
        },
        currentSkillIdRef,
        onSelectRef,
        onSkillDetailsRef,
        onToolDetailsRef,
        owner,
      }),
    [currentSkillId, owner]
  );

  const extensions = useMemo(
    () =>
      buildSkillInstructionsExtensions(isReadOnly, editableExtensions, {
        onSkillNodeDetails,
        onToolDetails,
      }),
    [editableExtensions, isReadOnly, onSkillNodeDetails, onToolDetails]
  );

  // Track if initial content has been set
  const initialContentSetRef = useRef(false);
  const [isContentReady, setIsContentReady] = useState(false);

  const editor = useEditor(
    {
      extensions,
      editable: !isReadOnly,
      immediatelyRender: false,
      onUpdate,
      onBlur,
      onDelete: onDelete
        ? ({ editor: editorInstance }) => onDelete(editorInstance)
        : undefined,
    },
    [extensions, isReadOnly]
  );

  const editorService = useEditorService(editor);

  onSelectRef.current = (item, editorInstance, range) => {
    if (editorInstance.isDestroyed) {
      return;
    }

    if (isInsertKnowledgeSlashCommand(item)) {
      editorInstance
        .chain()
        .focus()
        .deleteRange(range)
        .insertKnowledgeNode()
        .run();
      return;
    }

    if (isSkillSlashCommand(item)) {
      editorInstance
        .chain()
        .focus()
        .deleteRange(range)
        .insertSkillNode({
          skillId: item.data.skill.sId,
          skillIcon: item.data.skill.icon,
          skillName: item.data.skill.name,
        })
        .run();
      onSelectSkill?.(item.data.skill);
      return;
    }

    if (isToolSlashCommand(item)) {
      editorInstance
        .chain()
        .focus()
        .deleteRange(range)
        .insertToolNode({
          mcpServerViewId: item.data.tool.id,
          toolIcon: item.data.tool.icon,
          toolName: item.data.tool.name,
        })
        .run();
      onSelectTool?.(item.data.tool.view);
    }
  };

  // Set initial content after editor is created
  useEffect(() => {
    const hasContent = htmlContent || content;
    if (
      editor &&
      hasContent &&
      !initialContentSetRef.current &&
      !editor.isDestroyed
    ) {
      // Use requestAnimationFrame to ensure DOM is ready before setting content
      // This fixes Safari crashes where docView is accessed before render
      requestAnimationFrame(() => {
        if (editor && !editor.isDestroyed) {
          if (htmlContent) {
            editor.commands.setContent(htmlContent, { emitUpdate: false });
          } else {
            editor.commands.setContent(preprocessMarkdownForEditor(content), {
              emitUpdate: false,
              contentType: "markdown",
            });
          }
          initialContentSetRef.current = true;
          setIsContentReady(true);
        }
      });
    }
  }, [editor, content, htmlContent]);

  return { editor, editorService, isContentReady };
}

const readOnlyStyles = cn(
  "min-h-60 w-full min-w-0 rounded-xl border p-3",
  "border-border bg-muted-background",
  "dark:border-border-night dark:bg-muted-background-night"
);

interface SkillInstructionsEditorContentProps {
  editor: Editor | null;
  isReadOnly: boolean;
  className?: string;
}

export function SkillInstructionsEditorContent({
  editor,
  isReadOnly,
  className,
}: SkillInstructionsEditorContentProps) {
  return (
    <>
      {isReadOnly ? (
        <div className={cn(className, readOnlyStyles)}>
          <EditorContent editor={editor} className="leading-7" />
        </div>
      ) : (
        <EditorContent editor={editor} className={cn(className, "leading-7")} />
      )}
    </>
  );
}
