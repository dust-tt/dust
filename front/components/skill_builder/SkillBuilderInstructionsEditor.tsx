import { markdownStyles } from "@dust-tt/sparkle";
import type { Editor as CoreEditor } from "@tiptap/core";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import type { Editor as ReactEditor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { cva } from "class-variance-authority";
import debounce from "lodash/debounce";
import React, { useEffect, useMemo, useRef } from "react";
import { useController } from "react-hook-form";

import { AgentInstructionDiffExtension } from "@app/components/editor/extensions/agent_builder/AgentInstructionDiffExtension";
import { ListItemExtension } from "@app/components/editor/extensions/ListItemExtension";
import { OrderedListExtension } from "@app/components/editor/extensions/OrderedListExtension";
import { SKILL_BUILDER_INSTRUCTIONS_BLUR_EVENT } from "@app/components/skill_builder/events";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import type { SkillType } from "@app/types/assistant/skill_configuration";

export const INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT = 120_000;

const editorVariants = cva(
  [
    "overflow-auto border rounded-xl p-2 resize-y min-h-60 max-h-[1024px]",
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

interface SkillBuilderInstructionsEditorProps {
  compareVersion?: SkillType | null;
  isInstructionDiffMode?: boolean;
}

export function SkillBuilderInstructionsEditor({
  compareVersion,
  isInstructionDiffMode = false,
}: SkillBuilderInstructionsEditorProps = {}) {
  const { field, fieldState } = useController<
    SkillBuilderFormData,
    "instructions"
  >({
    name: "instructions",
  });

  const editorRef = useRef<ReactEditor | null>(null);
  const displayError = !!fieldState.error;

  const extensions = useMemo(() => {
    return [
      Markdown,
      StarterKit.configure({
        orderedList: false, // we use custom OrderedListExtension instead
        listItem: false, // we use custom ListItemExtension instead
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
      // Custom ordered list and list item extensions to preserve start attribute
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
  }, []);

  const debouncedUpdate = useMemo(
    () =>
      debounce((editor: CoreEditor | ReactEditor) => {
        if (!isInstructionDiffMode && !editor.isDestroyed) {
          field.onChange(editor.getMarkdown());
        }
      }, 250),
    [field, isInstructionDiffMode]
  );

  const editor = useEditor(
    {
      extensions,
      content: field.value,
      contentType: "markdown",
      onUpdate: ({ editor, transaction }) => {
        if (transaction.docChanged) {
          debouncedUpdate(editor);
        }
      },
      onBlur: () => {
        window.dispatchEvent(
          new CustomEvent(SKILL_BUILDER_INSTRUCTIONS_BLUR_EVENT)
        );
      },
      immediatelyRender: false,
    },
    [extensions]
  );

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    return () => {
      debouncedUpdate.cancel();
    };
  }, [debouncedUpdate]);

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

    if (editor.isFocused) {
      return;
    }
    const currentContent = editor.getMarkdown();
    if (currentContent !== field.value) {
      setTimeout(() => {
        editor.commands.setContent(field.value, {
          emitUpdate: false,
          contentType: "markdown",
        });
      }, 0);
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

      const currentText = editor.getMarkdown();
      const compareText = compareVersion.instructions ?? "";

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
    <div className="relative p-px">
      <EditorContent editor={editor} />
    </div>
  );
}
