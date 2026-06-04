import { AgentInstructionDiffExtension } from "@app/components/editor/extensions/agent_builder/AgentInstructionDiffExtension";
import type { SlashCommandSkillSuggestion } from "@app/components/editor/extensions/shared/SlashCommandSkillItems";
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
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import type { Transaction } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";

function useEditorService(
  editor: Editor | null,
  { enableSkillReferences }: { enableSkillReferences: boolean }
) {
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
          editor.commands.setContent(
            preprocessMarkdownForEditor(content, {
              enableSkillReferences,
            }),
            {
              emitUpdate: false,
              contentType: "markdown",
            }
          );
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
  }, [editor, enableSkillReferences]);
}

interface SkillInstructionsSkillReferencesOptions {
  currentSkillId?: string | null;
  enableSkillReferences: boolean;
  onSelectSkill?: (skill: SlashCommandSkillSuggestion) => void;
  onSelectTool?: (tool: MCPServerViewType) => void;
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
  currentSkillId,
  includeSkillSuggestions,
  onSelectSkill,
  onSelectTool,
  owner,
}: {
  currentSkillId?: string | null;
  includeSkillSuggestions: boolean;
  onSelectSkill?: (skill: SlashCommandSkillSuggestion) => void;
  onSelectTool?: (tool: MCPServerViewType) => void;
  owner?: LightWorkspaceType;
}) {
  return [
    SlashCommandExtension.configure({
      currentSkillId: currentSkillId ?? null,
      includeSkillSuggestions,
      onSelectSkill,
      onSelectTool,
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
  const enableSkillReferences = skillReferences?.enableSkillReferences === true;
  const currentSkillId = skillReferences?.currentSkillId ?? null;
  const onSelectSkill = skillReferences?.onSelectSkill;
  const onSelectTool = skillReferences?.onSelectTool;
  const owner = skillReferences?.owner;
  const includeSkillSuggestions = enableSkillReferences && !!owner;
  const editableExtensions = useMemo(
    () =>
      buildSkillInstructionsEditableExtensions({
        currentSkillId,
        includeSkillSuggestions,
        onSelectSkill,
        onSelectTool,
        owner,
      }),
    [
      currentSkillId,
      includeSkillSuggestions,
      onSelectSkill,
      onSelectTool,
      owner,
    ]
  );

  const extensions = useMemo(
    () =>
      buildSkillInstructionsExtensions(isReadOnly, editableExtensions, {
        enableSkillReferences,
      }),
    [editableExtensions, enableSkillReferences, isReadOnly]
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
      onDelete: onDelete ? ({ editor }) => onDelete(editor) : undefined,
    },
    [extensions, isReadOnly]
  );

  const editorService = useEditorService(editor, { enableSkillReferences });

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
            editor.commands.setContent(
              preprocessMarkdownForEditor(content, {
                enableSkillReferences,
              }),
              {
                emitUpdate: false,
                contentType: "markdown",
              }
            );
          }
          initialContentSetRef.current = true;
          setIsContentReady(true);
        }
      });
    }
  }, [editor, content, htmlContent, enableSkillReferences]);

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
