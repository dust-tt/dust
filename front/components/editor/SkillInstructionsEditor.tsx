import { cn, markdownStyles } from "@dust-tt/sparkle";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import type { Transaction } from "@tiptap/pm/state";
import type { Editor, Extensions } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect, useMemo, useRef } from "react";

import { AgentInstructionDiffExtension } from "@app/components/editor/extensions/agent_builder/AgentInstructionDiffExtension";
import { ListItemExtension } from "@app/components/editor/extensions/ListItemExtension";
import { OrderedListExtension } from "@app/components/editor/extensions/OrderedListExtension";
import { KnowledgeNode } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import { SlashCommandExtension } from "@app/components/editor/extensions/skill_builder/SlashCommandExtension";

export const INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT = 120_000;

export function buildSkillInstructionsExtensions(
  isReadOnly: boolean
): Extensions {
  const baseExtensions: Extensions = [
    Markdown,
    StarterKit.configure({
      orderedList: false,
      listItem: false,
      bulletList: {
        HTMLAttributes: {
          class: markdownStyles.unorderedList(),
        },
      },
      blockquote: false,
      horizontalRule: false,
      strike: false,
      code: {
        HTMLAttributes: {
          class: markdownStyles.codeBlock(),
        },
      },
      codeBlock: {
        HTMLAttributes: {
          class: markdownStyles.codeBlock(),
        },
      },
      paragraph: {
        HTMLAttributes: {
          class: markdownStyles.paragraph(),
        },
      },
    }),
    KnowledgeNode,
    OrderedListExtension.configure({
      HTMLAttributes: {
        class: markdownStyles.orderedList(),
      },
    }),
    ListItemExtension.configure({
      HTMLAttributes: {
        class: markdownStyles.list(),
      },
    }),
  ];

  if (!isReadOnly) {
    baseExtensions.push(
      SlashCommandExtension,
      AgentInstructionDiffExtension,
      Placeholder.configure({
        placeholder: "What does this skill do? How should it behave?",
        emptyNodeClass:
          "first:before:text-gray-400 first:before:italic first:before:content-[attr(data-placeholder)] first:before:pointer-events-none first:before:absolute",
      }),
      CharacterCount.configure({
        limit: INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT,
      })
    );
  }

  return baseExtensions;
}

function useEditorService(editor: Editor | null) {
  return useMemo(() => {
    return {
      getMarkdown() {
        return editor?.getMarkdown() ?? "";
      },

      setContent(content: string) {
        editor?.commands.setContent(content, {
          emitUpdate: false,
          contentType: "markdown",
        });
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

export function useSkillInstructionsEditor({
  content,
  isReadOnly,
  onUpdate,
  onBlur,
  onDelete,
}: UseSkillInstructionsEditorProps) {
  const extensions = useMemo(
    () => buildSkillInstructionsExtensions(isReadOnly),
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
    if (editor && content && !initialContentSetRef.current) {
      editor.commands.setContent(content, {
        emitUpdate: false,
        contentType: "markdown",
      });
      initialContentSetRef.current = true;
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
