import { AgentInstructionDiffExtension } from "@app/components/editor/extensions/agent_builder/AgentInstructionDiffExtension";
import { cn } from "@dust-tt/sparkle";
import { Placeholder } from "@tiptap/extensions";
import type { Transaction } from "@tiptap/pm/state";
import type { Editor, Extensions } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect, useMemo, useRef } from "react";

function buildSkillDescriptionExtensions(): Extensions {
  return [
    StarterKit.configure({
      blockquote: false,
      horizontalRule: false,
      strike: false,
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      codeBlock: false,
      code: false,
    }),
    AgentInstructionDiffExtension,
    Placeholder.configure({
      placeholder:
        "When should this skill be used? What is this skill good for?",
      emptyNodeClass:
        "first:before:text-gray-400 first:before:italic first:before:content-[attr(data-placeholder)] first:before:pointer-events-none first:before:absolute",
    }),
  ];
}

interface UseSkillDescriptionEditorProps {
  content: string;
  onUpdate?: (props: { editor: Editor; transaction: Transaction }) => void;
  onBlur?: () => void;
}

export function useSkillDescriptionEditor({
  content,
  onUpdate,
  onBlur,
}: UseSkillDescriptionEditorProps) {
  const extensions = useMemo(() => buildSkillDescriptionExtensions(), []);

  const initialContentSetRef = useRef(false);

  const editor = useEditor(
    {
      extensions,
      editable: true,
      immediatelyRender: false,
      onUpdate,
      onBlur,
    },
    [extensions]
  );

  // Set initial content after editor is created.
  useEffect(() => {
    if (
      editor &&
      content &&
      !initialContentSetRef.current &&
      !editor.isDestroyed
    ) {
      requestAnimationFrame(() => {
        if (editor && !editor.isDestroyed) {
          editor.commands.setContent(`<p>${content}</p>`, {
            emitUpdate: false,
          });
          initialContentSetRef.current = true;
        }
      });
    }
  }, [editor, content]);

  return { editor };
}

interface SkillDescriptionEditorContentProps {
  editor: Editor | null;
  className?: string;
}

export function SkillDescriptionEditorContent({
  editor,
  className,
}: SkillDescriptionEditorContentProps) {
  return (
    <EditorContent
      editor={editor}
      className={cn(className, "leading-7 text-base")}
    />
  );
}
