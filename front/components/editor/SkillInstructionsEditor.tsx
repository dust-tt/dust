import { cn, markdownStyles } from "@dust-tt/sparkle";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import type { Editor, Extensions } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useMemo } from "react";

import { AgentInstructionDiffExtension } from "@app/components/editor/extensions/agent_builder/AgentInstructionDiffExtension";
import { ListItemExtension } from "@app/components/editor/extensions/ListItemExtension";
import { OrderedListExtension } from "@app/components/editor/extensions/OrderedListExtension";
import { KnowledgeNode } from "@app/components/editor/extensions/skill_builder/KnowledgeNode";
import { SlashCommandExtension } from "@app/components/editor/extensions/skill_builder/SlashCommandExtension";

export const INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT = 120_000;

interface SkillInstructionsEditorProps {
  content: string;
  isReadOnly: boolean;
  className?: string;
  onUpdate?: (editor: Editor) => void;
  onBlur?: () => void;
  onDelete?: (editor: Editor) => void;
}

export function useSkillInstructionsExtensions(
  isReadOnly: boolean
): Extensions {
  return useMemo(() => {
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
  }, [isReadOnly]);
}

const readOnlyStyles = cn(
  "min-h-60 w-full min-w-0 rounded-xl border p-3",
  "border-border bg-muted-background",
  "dark:border-border-night dark:bg-muted-background-night"
);

export function SkillInstructionsEditor({
  content,
  isReadOnly,
  className,
  onUpdate,
  onBlur,
  onDelete,
}: SkillInstructionsEditorProps) {
  const extensions = useSkillInstructionsExtensions(isReadOnly);

  const editor = useEditor(
    {
      extensions,
      content: content || undefined,
      contentType: "markdown",
      editable: !isReadOnly,
      immediatelyRender: false,
      onUpdate: onUpdate
        ? ({ editor, transaction }) => {
            if (transaction.docChanged) {
              onUpdate(editor);
            }
          }
        : undefined,
      onBlur: onBlur ? () => onBlur() : undefined,
      onDelete: onDelete ? ({ editor }) => onDelete(editor) : undefined,
    },
    [extensions, isReadOnly]
  );

  if (isReadOnly) {
    return (
      <div className={className ?? readOnlyStyles}>
        <EditorContent editor={editor} />
      </div>
    );
  }

  return <EditorContent editor={editor} className={className} />;
}
