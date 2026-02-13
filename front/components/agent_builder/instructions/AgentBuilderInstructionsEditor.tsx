import { cn, ContainerWithTopBar, markdownStyles } from "@dust-tt/sparkle";
import type { Editor as CoreEditor, Extensions } from "@tiptap/core";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import type { Editor as ReactEditor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { cva } from "class-variance-authority";
import debounce from "lodash/debounce";
import type { ReactNode } from "react";
import React from "react";
import { useEffect, useMemo, useRef } from "react";
import { useController } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useCopilotSuggestions } from "@app/components/agent_builder/copilot/CopilotSuggestionsContext";
import { SuggestionBubbleMenu } from "@app/components/agent_builder/copilot/SuggestionBubbleMenu";
import { BlockInsertDropdown } from "@app/components/agent_builder/instructions/BlockInsertDropdown";
import { InstructionsMenuBar } from "@app/components/agent_builder/instructions/InstructionsMenuBar";
import { InstructionTipsPopover } from "@app/components/agent_builder/instructions/InstructionsTipsPopover";
import { useBlockInsertDropdown } from "@app/components/agent_builder/instructions/useBlockInsertDropdown";
import { AgentInstructionDiffExtension } from "@app/components/editor/extensions/agent_builder/AgentInstructionDiffExtension";
import { BlockIdExtension } from "@app/components/editor/extensions/agent_builder/BlockIdExtension";
import { BlockInsertExtension } from "@app/components/editor/extensions/agent_builder/BlockInsertExtension";
import { InstructionBlockExtension } from "@app/components/editor/extensions/agent_builder/InstructionBlockExtension";
import { InstructionsDocumentExtension } from "@app/components/editor/extensions/agent_builder/InstructionsDocumentExtension";
import { InstructionsRootExtension } from "@app/components/editor/extensions/agent_builder/InstructionsRootExtension";
import {
  getActiveSuggestions,
  InstructionSuggestionExtension,
} from "@app/components/editor/extensions/agent_builder/InstructionSuggestionExtension";
import { EmojiExtension } from "@app/components/editor/extensions/EmojiExtension";
import { HeadingExtension } from "@app/components/editor/extensions/HeadingExtension";
import { KeyboardShortcutsExtension } from "@app/components/editor/extensions/input_bar/KeyboardShortcutsExtension";
import { MentionExtension } from "@app/components/editor/extensions/MentionExtension";
import {
  cleanupPastedHTML,
  stripHtmlAttributes,
} from "@app/components/editor/input_bar/cleanupPastedHTML";
import { LinkExtension } from "@app/components/editor/input_bar/LinkExtension";
import { createMentionSuggestion } from "@app/components/editor/input_bar/mentionSuggestion";
import { preprocessMarkdownForEditor } from "@app/components/editor/lib/preprocessMarkdownForEditor";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";

export const INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT = 120_000;

/**
 * Base rendering extensions for the agent instructions editor.
 * Used by the full editor and by read-only preview pages (e.g. poke).
 */
export function buildAgentInstructionsReadOnlyExtensions(): Extensions {
  return [
    Markdown,
    InstructionsDocumentExtension,
    StarterKit.configure({
      document: false, // Disabled, we use a custom document to enforce a single instructions root node.
      heading: false, // Disabled, we use a custom one, see below.
      hardBreak: false, // Disabled, we use custom EmptyLineParagraphExtension instead.
      paragraph: {
        HTMLAttributes: {
          class: markdownStyles.paragraph(),
        },
      },
      orderedList: {
        HTMLAttributes: {
          class: markdownStyles.orderedList(),
        },
      },
      listItem: {
        HTMLAttributes: {
          class: markdownStyles.list(),
        },
      },
      link: false, // we use custom LinkExtension instead
      bulletList: {
        HTMLAttributes: {
          class: markdownStyles.unorderedList(),
        },
      },
      blockquote: false,
      horizontalRule: false,
      strike: false,
      undoRedo: {
        depth: 100,
      },
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
    }),
    InstructionsRootExtension,
    BlockIdExtension,
    InstructionBlockExtension,
    HeadingExtension.configure({
      levels: [1, 2, 3, 4, 5, 6],
      HTMLAttributes: { class: "mt-4 mb-3" },
    }),
    EmojiExtension,
    LinkExtension.configure({
      HTMLAttributes: {
        class: "text-blue-600 hover:underline hover:text-blue-800",
      },
      autolink: false,
      openOnClick: false,
    }),
  ];
}

export const BLUR_EVENT_NAME = "agent:instructions:blur";

const editorVariants = cva(
  [
    "overflow-auto p-2 resize-y min-h-60 max-h-[1024px]",
    "transition-all duration-200",
  ],
  {
    variants: {
      embedded: {
        true: [
          "rounded-b-xl border-0 bg-transparent",
          "focus:ring-0 focus:outline-none focus:border-0",
        ],
        false: [
          "border rounded-xl",
          "bg-muted-background dark:bg-muted-background-night",
          "focus:ring-highlight-300 dark:focus:ring-highlight-300-night",
          "focus:outline-highlight-200 dark:focus:outline-highlight-200-night",
          "focus:border-highlight-300 dark:focus:border-highlight-300-night",
        ],
      },
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
      embedded: false,
      error: false,
    },
  }
);

function ToolbarSlot({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

interface AgentBuilderInstructionsEditorProps {
  compareVersion?: LightAgentConfigurationType | null;
  isInstructionDiffMode?: boolean;
  children?: ReactNode;
}

export function AgentBuilderInstructionsEditor({
  compareVersion,
  isInstructionDiffMode = false,
  children,
}: AgentBuilderInstructionsEditorProps = {}) {
  const toolbarExtra =
    React.Children.toArray(children).find(
      (child): child is React.ReactElement =>
        React.isValidElement(child) && child.type === ToolbarSlot
    )?.props.children ?? null;

  const { owner } = useAgentBuilderContext();
  const { hasFeature } = useFeatureFlags({ workspaceId: owner.sId });
  const hasCopilot = hasFeature("agent_builder_copilot");

  const { field } = useController<AgentBuilderFormData, "instructions">({
    name: "instructions",
  });
  const { field: instructionsHtmlField } = useController<
    AgentBuilderFormData,
    "instructionsHtml"
  >({
    name: "instructionsHtml",
  });
  const editorRef = useRef<ReactEditor | null>(null);
  const blockDropdown = useBlockInsertDropdown(editorRef);
  const suggestionHandler = blockDropdown.suggestionOptions;
  const initialContentSetRef = useRef(false);

  const suggestionsContext = useCopilotSuggestions();

  const extensions = useMemo(() => {
    const extensions: Extensions = [
      ...buildAgentInstructionsReadOnlyExtensions(),
      KeyboardShortcutsExtension,
      AgentInstructionDiffExtension,
      InstructionSuggestionExtension,
      BlockInsertExtension.configure({
        suggestion: suggestionHandler,
      }),
      Placeholder.configure({
        placeholder: ({ editor }) => {
          // Hide placeholder when suggestions are being displayed.
          if (getActiveSuggestions(editor.state).size > 0) {
            return "";
          }

          // Don't show placeholder inside instruction blocks.
          const { selection } = editor.state;
          const $pos = selection.$anchor;
          for (let depth = $pos.depth; depth > 0; depth--) {
            if ($pos.node(depth).type.name === "instructionBlock") {
              return "";
            }
          }

          return "What is the purpose of the agent? How should it behave?";
        },
        emptyNodeClass:
          "first:before:text-gray-400 first:before:italic first:before:content-[attr(data-placeholder)] first:before:pointer-events-none first:before:absolute",
      }),
      CharacterCount.configure({
        limit: INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT,
      }),
      MentionExtension.configure({
        owner,
        HTMLAttributes: {
          class:
            "min-w-0 px-0 py-0 border-none outline-none focus:outline-none focus:border-none ring-0 focus:ring-0 text-highlight-500 font-semibold",
        },
        suggestion: createMentionSuggestion({
          owner,
          conversationId: null,
          includeCurrentUser: true,
          select: {
            agents: false,
            users: true,
          },
        }),
      }),
    ];

    return extensions;
  }, [owner, suggestionHandler]);

  // Debounce serialization to prevent performance issues
  const debouncedUpdate = useMemo(
    () =>
      debounce((editor: CoreEditor | ReactEditor) => {
        if (!isInstructionDiffMode && !editor.isDestroyed) {
          field.onChange(editor.getMarkdown());
          // Strip style/class/id attributes to store clean HTML structure.
          instructionsHtmlField.onChange(stripHtmlAttributes(editor.getHTML()));
        }
      }, 250),
    [field, instructionsHtmlField, isInstructionDiffMode]
  );

  const editor = useEditor(
    {
      extensions,
      // Don't set content here - it can cause race conditions in Safari
      // Content will be set in a separate useEffect after the editor is ready
      contentType: "markdown",
      onUpdate: ({ editor, transaction }) => {
        if (transaction.docChanged) {
          debouncedUpdate(editor);
        }
      },
      onBlur: () => {
        window.dispatchEvent(new CustomEvent(BLUR_EVENT_NAME));
        return false;
      },
      editorProps: {
        // Cleans up incoming HTML to remove Chrome-specific wrapper tags (e.g., <b style="font-weight:normal">)
        // that interfere with instruction block parsing
        transformPastedHTML(html: string) {
          return cleanupPastedHTML(html);
        },
      },
      immediatelyRender: false,
    },
    [extensions]
  );

  // Set initial content after editor is created, then focus
  // This is separated from useEditor() to avoid Safari race conditions
  // Only runs once when editor is first created
  useEffect(() => {
    if (!editor || editor.isDestroyed || initialContentSetRef.current) {
      return;
    }

    editorRef.current = editor;
    // Mark as set immediately to prevent race conditions
    initialContentSetRef.current = true;

    // Register the editor with the suggestions context if available.
    if (suggestionsContext) {
      suggestionsContext.registerEditor(editor);
    }

    // Use requestAnimationFrame to ensure DOM is fully ready
    // This fixes "Applying a mismatched transaction" error in Safari/iOS
    requestAnimationFrame(() => {
      if (!editor || editor.isDestroyed) {
        return;
      }

      // Prefer HTML content if available (preserves block IDs for copilot targeting).
      // Fall back to markdown for agents without stored HTML.
      if (instructionsHtmlField.value) {
        editor.commands.setContent(instructionsHtmlField.value, {
          emitUpdate: false,
        });
      } else if (field.value) {
        editor.commands.setContent(preprocessMarkdownForEditor(field.value), {
          emitUpdate: false,
          contentType: "markdown",
        });
      }

      // Then focus after content is set
      // Use a second RAF to ensure content setting is complete
      requestAnimationFrame(() => {
        if (editor && !editor.isDestroyed) {
          // Sync instructionsHtml field with current editor state.
          // For HTML loads, this preserves existing IDs; for markdown loads, this generates new ones.
          instructionsHtmlField.onChange(stripHtmlAttributes(editor.getHTML()));
          editor.commands.focus("end");
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]); // Only run when editor is created, not when field.value changes

  useEffect(() => {
    return () => {
      debouncedUpdate.cancel();
    };
  }, [debouncedUpdate]);

  const currentCharacterCount =
    editor?.storage.characterCount.characters() ?? 0;
  const displayError =
    currentCharacterCount >= INSTRUCTIONS_MAXIMUM_CHARACTER_COUNT;

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setOptions({
      editorProps: {
        attributes: {
          class: editorVariants({
            embedded: true,
            error: displayError,
          }),
        },
        // Preserve the transformPastedHTML handler when updating editorProps
        transformPastedHTML(html: string) {
          return cleanupPastedHTML(html);
        },
      },
    });
  }, [editor, displayError]);

  useEffect(() => {
    if (
      !editor ||
      field.value === undefined ||
      editor.isDestroyed ||
      !initialContentSetRef.current
    ) {
      return;
    }

    if (editor.isFocused) {
      return;
    }

    // Skip while the editor is in diff mode — the diff mode effect handles
    // content sync after exiting diff to guarantee correct ordering.
    if (editor.storage.agentInstructionDiff?.isDiffMode) {
      return;
    }

    const currentContent = editor.getMarkdown();
    if (currentContent !== field.value) {
      // Use requestAnimationFrame to ensure DOM is ready (Safari fix).
      requestAnimationFrame(() => {
        if (editor && !editor.isDestroyed) {
          // Prefer HTML content if available (preserves block IDs for copilot targeting).
          // Fall back to markdown for agents without stored HTML.
          if (instructionsHtmlField.value) {
            editor.commands.setContent(instructionsHtmlField.value, {
              emitUpdate: false,
            });
          } else {
            editor.commands.setContent(
              preprocessMarkdownForEditor(field.value),
              {
                emitUpdate: false,
                contentType: "markdown",
              }
            );
          }
        }
      });
    }
  }, [editor, field.value, instructionsHtmlField.value]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return;
    }

    // Use requestAnimationFrame to defer editor commands outside the React
    // lifecycle. Tiptap internally calls flushSync when processing commands,
    // which is not allowed inside useEffect.
    requestAnimationFrame(() => {
      if (!editor || editor.isDestroyed) {
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
      } else if (!isInstructionDiffMode) {
        if (editor.storage.agentInstructionDiff?.isDiffMode) {
          editor.commands.exitDiff();
          editor.setEditable(true);

          // After exiting diff, sync editor content with the current form
          // value. The regular content sync effect skips while the editor is in
          // diff mode, so we handle content restoration here.
          if (field.value !== undefined) {
            const currentContent = editor.getMarkdown();
            if (currentContent !== field.value) {
              editor.commands.setContent(
                preprocessMarkdownForEditor(field.value),
                { emitUpdate: false, contentType: "markdown" }
              );
              // Regenerate the HTML field with fresh block IDs.
              instructionsHtmlField.onChange(
                stripHtmlAttributes(editor.getHTML())
              );
            }
          }
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInstructionDiffMode, compareVersion, editor]);

  const pendingInstructionSuggestions = suggestionsContext
    ? suggestionsContext
        .getPendingSuggestions()
        .filter((s) => s.kind === "instructions")
    : [];
  const hasPendingInstructionSuggestions =
    pendingInstructionSuggestions.length > 0;

  const handleAcceptAll = () => {
    void suggestionsContext.acceptAllInstructionSuggestions();
  };
  const handleRejectAll = () => {
    void suggestionsContext.rejectAllInstructionSuggestions();
  };

  const editorContent = (
    <div className="relative p-px">
      <EditorContent editor={editor} />
      {editor && <SuggestionBubbleMenu editor={editor} />}
      {!hasCopilot && (
        // TODO(copilot): Remove the whole InstructionTipsPopover and endpoint when copilot is released.
        <div className="absolute bottom-2 right-2">
          <InstructionTipsPopover owner={owner} />
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col gap-1">
      <ContainerWithTopBar
        error={displayError}
        topBar={
          <InstructionsMenuBar
            editor={editor}
            onAcceptAll={handleAcceptAll}
            onRejectAll={handleRejectAll}
            showSuggestionActions={
              hasCopilot && hasPendingInstructionSuggestions
            }
            toolbarExtra={toolbarExtra}
          />
        }
      >
        {editorContent}
      </ContainerWithTopBar>
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

AgentBuilderInstructionsEditor.ToolbarSlot = ToolbarSlot;

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
