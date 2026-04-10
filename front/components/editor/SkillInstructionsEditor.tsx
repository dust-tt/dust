import { AgentInstructionDiffExtension } from "@app/components/editor/extensions/agent_builder/AgentInstructionDiffExtension";
import { KNOWLEDGE_NODE_TYPE } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import type { KnowledgeItem } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";
import { SlashCommandExtension } from "@app/components/editor/extensions/skill_builder/SlashCommandExtension";
import {
  buildSkillInstructionsExtensions,
  INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT,
} from "@app/lib/editor/build_skill_instructions_extensions";
import { preprocessMarkdown } from "@app/lib/editor/skill_instructions_preprocessing";
import { cn } from "@dust-tt/sparkle";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import type { Transaction } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";

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
          editor.commands.setContent(preprocessMarkdown(content), {
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

interface UseSkillInstructionsEditorProps {
  content: string;
  isReadOnly: boolean;
  onUpdate?: (props: { editor: Editor; transaction: Transaction }) => void;
  onBlur?: () => void;
  onDelete?: (editor: Editor) => void;
}

const skillInstructionsEditableExtensions = [
  SlashCommandExtension,
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

export function useSkillInstructionsEditor({
  content,
  isReadOnly,
  onUpdate,
  onBlur,
  onDelete,
}: UseSkillInstructionsEditorProps) {
  const extensions = useMemo(
    () =>
      buildSkillInstructionsExtensions(
        isReadOnly,
        skillInstructionsEditableExtensions
      ),
    [isReadOnly]
  );

  // Track if initial content has been set
  const initialContentSetRef = useRef(false);

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

  const editorService = useEditorService(editor);

  // Set initial content after editor is created (markdown must be set via setContent)
  useEffect(() => {
    if (
      editor &&
      content &&
      !initialContentSetRef.current &&
      !editor.isDestroyed
    ) {
      // Use requestAnimationFrame to ensure DOM is ready before setting content
      // This fixes Safari crashes where docView is accessed before render
      requestAnimationFrame(() => {
        if (editor && !editor.isDestroyed) {
          editor.commands.setContent(preprocessMarkdown(content), {
            emitUpdate: false,
            contentType: "markdown",
          });
          initialContentSetRef.current = true;
        }
      });
    }
  }, [editor, content]);

  return { editor, editorService };
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
