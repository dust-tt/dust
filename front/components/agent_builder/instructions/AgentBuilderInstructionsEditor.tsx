import { cn, markdownStyles } from "@dust-tt/sparkle";
import type { Editor as CoreEditor } from "@tiptap/core";
import { CharacterCount } from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import type { Editor as ReactEditor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { cva } from "class-variance-authority";
import debounce from "lodash/debounce";
import React, { useEffect, useMemo, useRef } from "react";
import { useController } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { BlockInsertDropdown } from "@app/components/agent_builder/instructions/BlockInsertDropdown";
import { AgentInstructionDiffExtension } from "@app/components/agent_builder/instructions/extensions/AgentInstructionDiffExtension";
import { BlockInsertExtension } from "@app/components/agent_builder/instructions/extensions/BlockInsertExtension";
import { InstructionBlockExtension } from "@app/components/agent_builder/instructions/extensions/InstructionBlockExtension";
import { InstructionTipsPopover } from "@app/components/agent_builder/instructions/InstructionsTipsPopover";
import { useBlockInsertDropdown } from "@app/components/agent_builder/instructions/useBlockInsertDropdown";
import { ParagraphExtension } from "@app/components/assistant/conversation/input_bar/editor/extensions/ParagraphExtension";
import {
  plainTextFromTipTapContent,
  tipTapContentFromPlainText,
} from "@app/lib/client/agent_builder/instructions";
import type { LightAgentConfigurationType } from "@app/types";

export const INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT = 120_000;

const editorVariants = cva(
  [
    "overflow-auto border rounded-xl p-2 resize-y min-h-60 h-100",
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

  // Create a ref to hold the editor instance
  const editorRef = useRef<ReactEditor | null>(null);

  // Setup the block insert dropdown
  const blockDropdown = useBlockInsertDropdown(editorRef);

  // Use the stable suggestion options object from the dropdown hook
  const suggestionHandler = blockDropdown.suggestionOptions;

  const extensions = useMemo(() => {
    return [
      StarterKit.configure({
        paragraph: false, // We use custom ParagraphExtension
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        horizontalRule: false,
        bold: false,
        italic: false,
        strike: false,
        history: {
          depth: 100,
        },
        codeBlock: {
          HTMLAttributes: {
            class: markdownStyles.code(),
          },
        },
      }),
      ParagraphExtension,
      InstructionBlockExtension,
      AgentInstructionDiffExtension,
      BlockInsertExtension.configure({
        suggestion: suggestionHandler,
      }),
      Placeholder.configure({
        placeholder:
          "What does this agent do? How should it behave? What should it avoid doing?",
        emptyNodeClass:
          "first:before:text-gray-400 first:before:italic first:before:content-[attr(data-placeholder)] first:before:pointer-events-none first:before:absolute",
      }),
      CharacterCount.configure({
        limit: INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT,
      }),
    ];
  }, [suggestionHandler]);

  // Create a debounced update function to prevent performance issues with large documents
  const debouncedUpdate = useMemo(
    () =>
      debounce((editor: CoreEditor | ReactEditor) => {
        if (!isInstructionDiffMode && !editor.isDestroyed) {
          const json = editor.getJSON();
          const plainText = plainTextFromTipTapContent(json);
          field.onChange(plainText);
        }
      }, 250),
    [field, isInstructionDiffMode]
  );

  const editor = useEditor(
    {
      extensions,
      content: tipTapContentFromPlainText(field.value),
      autofocus: "end", // Focus at the end of content
      onUpdate: ({ editor, transaction }) => {
        // Only update if the document content actually changed (not just selection)
        if (transaction.docChanged) {
          debouncedUpdate(editor);
        }
      },
    },
    [extensions]
  );

  // Update the editor ref when the editor is created
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Cleanup debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedUpdate.cancel();
    };
  }, [debouncedUpdate]);

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

    // Don't update if editor is focused (user is typing/editing)
    if (editor.isFocused) {
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
      <div
        className="relative p-px"
        onClick={(e) => {
          // Focus the editor when the container is clicked
          if (e.target === e.currentTarget && editor && !editor.isFocused) {
            editor.commands.focus();
          }
        }}
      >
        <EditorContent
          editor={editor}
          className="h-full min-h-[200px] cursor-text"
        />
        <div
          className="absolute bottom-2 right-2"
          onClick={(e) => {
            // Prevent the container's click handler from focusing the editor
            e.stopPropagation();
          }}
        >
          <InstructionTipsPopover owner={owner} />
        </div>
      </div>
      {editor && (
        <CharacterCountDisplay
          count={currentCharacterCount}
          maxCount={INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT}
        />
      )}
      <BlockInsertDropdown blockDropdownState={blockDropdown} />
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
