import { CharacterCount } from "@tiptap/extension-character-count";
import Document from "@tiptap/extension-document";
import { History } from "@tiptap/extension-history";
import Text from "@tiptap/extension-text";
import { EditorContent, useEditor } from "@tiptap/react";
import { cva } from "class-variance-authority";
import React, { useEffect } from "react";

import { useAgentBuilderInstructionsContext } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsContext";
import { ParagraphExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/ParagraphExtension";
import {
  plainTextFromTipTapContent,
  tipTapContentFromPlainText,
} from "@app/lib/client/assistant_builder/instructions";
import { classNames } from "@app/lib/utils";

export const INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT = 120_000;

const extensions = [
  Document,
  Text,
  ParagraphExtension,
  History,
  CharacterCount.configure({
    limit: INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT,
  }),
];

const editorVariants = cva(
  [
    "overflow-auto min-h-60 h-full border rounded-xl p-2",
    "transition-all duration-200",
    "bg-muted-background dark:bg-muted-background-night",
  ],
  {
    variants: {
      error: {
        true: [
          "border-warning-500 dark:border-warning-500-night",
          "focus:ring-warning-500 dark:focus:ring-warning-500-night",
          "focus:outline-warning-500 dark:focus:outline-warning-500-night",
          "focus:border-warning-500 dark:focus:border-warning-500-night",
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

export function AgentBuilderInstructionsEditor() {
  const { instructions, setInstructions } =
    useAgentBuilderInstructionsContext();

  const editor = useEditor({
    extensions,
    content: tipTapContentFromPlainText(instructions),
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      const plainText = plainTextFromTipTapContent(json);
      setInstructions(plainText);
    },
  });

  const currentCharacterCount =
    editor?.storage.characterCount.characters() || 0;
  const displayError =
    currentCharacterCount >= INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT;

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
    if (!editor || instructions === undefined) {
      return;
    }

    const currentContent = plainTextFromTipTapContent(editor.getJSON());
    if (currentContent !== instructions) {
      editor.commands.setContent(tipTapContentFromPlainText(instructions));
    }
  }, [editor, instructions]);

  return (
    <div className="flex h-full flex-col gap-1">
      <div className="relative h-full min-h-60 grow p-px">
        <EditorContent editor={editor} className="absolute inset-0" />
      </div>
      {editor && (
        <CharacterCountDisplay
          count={currentCharacterCount}
          maxCount={INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT}
        />
      )}
    </div>
  );
}

interface CharacterCountDisplayProps {
  count: number;
  maxCount: number;
}

const CharacterCountDisplay = ({
  count,
  maxCount,
}: CharacterCountDisplayProps) => {
  if (count <= maxCount / 2) {
    return null;
  }

  const isOverLimit = count >= maxCount;

  return (
    <span
      className={classNames(
        "text-end text-xs",
        isOverLimit
          ? "text-warning"
          : "text-muted-foreground dark:text-muted-foreground-night"
      )}
    >
      {count} / {maxCount} characters
    </span>
  );
};
