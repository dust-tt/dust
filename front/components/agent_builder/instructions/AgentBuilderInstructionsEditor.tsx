import { cn } from "@dust-tt/sparkle";
import { CharacterCount } from "@tiptap/extension-character-count";
import Document from "@tiptap/extension-document";
import { History } from "@tiptap/extension-history";
import Text from "@tiptap/extension-text";
import { EditorContent, useEditor } from "@tiptap/react";
import { cva } from "class-variance-authority";
import React, { useEffect } from "react";
import { useController } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentInstructionDiffExtension } from "@app/components/agent_builder/instructions/AgentInstructionDiffExtension";
import { InstructionTipsPopover } from "@app/components/agent_builder/instructions/InstructionsTipsPopover";
import { ParagraphExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/ParagraphExtension";
import {
  plainTextFromTipTapContent,
  tipTapContentFromPlainText,
} from "@app/lib/client/assistant_builder/instructions";
import type { LightAgentConfigurationType } from "@app/types";

export const INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT = 120_000;

const extensions = [
  Document,
  Text,
  ParagraphExtension,
  History,
  AgentInstructionDiffExtension,
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

interface AgentBuilderInstructionsEditorProps {
  compareVersion?: LightAgentConfigurationType | null;
  isInstructionDiffMode?: boolean;
}

export function AgentBuilderInstructionsEditor({
  compareVersion,
  isInstructionDiffMode = false,
}: AgentBuilderInstructionsEditorProps = {}) {
  const { owner } = useAgentBuilderContext();
  const { field } = useController<AgentBuilderFormData, "instructions">({
    name: "instructions",
  });

  const editor = useEditor({
    extensions,
    content: tipTapContentFromPlainText(field.value),
    onUpdate: ({ editor }) => {
      if (!isInstructionDiffMode) {
        const json = editor.getJSON();
        const plainText = plainTextFromTipTapContent(json);
        field.onChange(plainText);
      }
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
    if (!editor || field.value === undefined) {
      return;
    }

    const currentContent = plainTextFromTipTapContent(editor.getJSON());
    if (currentContent !== field.value) {
      editor.commands.setContent(tipTapContentFromPlainText(field.value));
    }
  }, [editor, field.value]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (isInstructionDiffMode && compareVersion) {
      if (editor.storage.agentInstructionDiff?.isDiffMode) {
        editor.commands.exitDiff();
      }

      const currentText = plainTextFromTipTapContent(editor.getJSON());
      const compareText = compareVersion.instructions || "";

      editor.commands.applyDiff(compareText, currentText);
      editor.setEditable(false);
    } else if (!isInstructionDiffMode && editor) {
      if (editor.storage.agentInstructionDiff?.isDiffMode) {
        editor.commands.exitDiff();
        editor.setEditable(true);
      }
    }
  }, [isInstructionDiffMode, compareVersion, editor]);

  return (
    <div className="flex h-full flex-col gap-1">
      <div className="relative h-full min-h-100 grow p-px">
        <EditorContent editor={editor} className="absolute inset-0" />
        <div className="absolute bottom-2 right-2">
          <InstructionTipsPopover owner={owner} />
        </div>
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
      className={cn(
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
