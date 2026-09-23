import { Icon } from "@sparkle/components/Icon";
import { Separator } from "@sparkle/components/Separator";
import { Tooltip } from "@sparkle/components/Tooltip";
import {
  Bold01,
  Code01,
  Italic01,
  MessagePlusCircle,
} from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { type Editor, isTextSelection } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import React from "react";
import { documentCommentsPluginKey } from "./DocumentComments";

interface DocumentSelectionToolbarProps {
  editor: Editor;
  mountPortalContainer?: HTMLElement;
  /** Shows the Comment action after the formatting controls. */
  onComment?: () => void;
}

const TOOLBAR_BUTTON_CLASS = cn(
  "inline-flex h-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-hover hover:text-foreground motion-reduce:transition-none",
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
);

/**
 * @cc [owner:flvndvd,label:product] document-comment-cta
 * The Comment action MUST appear only when onComment is provided and the selection can
 * start a draft. The toolbar MUST stay hidden while a comment draft is pending.
 */
export const DocumentSelectionToolbar = ({
  editor,
  mountPortalContainer,
  onComment,
}: DocumentSelectionToolbarProps) => {
  const selection = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      strike: editor.isActive("strike"),
      code: editor.isActive("code"),
      canComment: editor.can().startCommentDraft(),
    }),
  });
  const isApple =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform);
  const modifier = isApple ? "Cmd" : "Ctrl";

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top" }}
      className="relative z-50 font-sans text-foreground antialiased print:hidden"
      shouldShow={({ editor, state, from, to }) =>
        editor.isEditable &&
        isTextSelection(state.selection) &&
        !state.selection.empty &&
        state.doc.textBetween(from, to).length > 0 &&
        !documentCommentsPluginKey.getState(state)?.draft &&
        (editor.isFocused ||
          !!document.activeElement?.closest("[data-document-selection]"))
      }
    >
      <div
        role="toolbar"
        aria-label="Format selection"
        data-document-selection=""
        className="flex items-center gap-0.5 rounded-xl border border-border bg-overlay-background p-1"
      >
        {[
          {
            label: "Bold",
            shortcut: `${modifier}+B`,
            icon: Bold01,
            active: selection.bold,
            run: () => editor.chain().focus().toggleBold().run(),
          },
          {
            label: "Italic",
            shortcut: `${modifier}+I`,
            icon: Italic01,
            active: selection.italic,
            run: () => editor.chain().focus().toggleItalic().run(),
          },
          {
            label: "Strikethrough",
            shortcut: `${modifier}+Shift+S`,
            icon: undefined,
            active: selection.strike,
            run: () => editor.chain().focus().toggleStrike().run(),
          },
          {
            label: "Inline code",
            shortcut: `${modifier}+E`,
            icon: Code01,
            active: selection.code,
            run: () => editor.chain().focus().toggleCode().run(),
          },
        ].map(({ label, shortcut, icon, active, run }) => (
          <Tooltip
            key={label}
            label={label}
            shortcut={shortcut}
            tooltipTriggerAsChild
            mountPortalContainer={mountPortalContainer}
            trigger={
              <button
                type="button"
                aria-label={label}
                aria-pressed={active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={run}
                className={cn(
                  TOOLBAR_BUTTON_CLASS,
                  "size-8",
                  "aria-pressed:border-border aria-pressed:bg-selected aria-pressed:text-foreground",
                  label === "Inline code" &&
                    "relative ml-1 before:absolute before:-left-1 before:h-4 before:w-px before:bg-border"
                )}
              >
                <span aria-hidden="true">
                  {icon ? (
                    <Icon visual={icon} size="xs" />
                  ) : (
                    <span className="text-base line-through">S</span>
                  )}
                </span>
              </button>
            }
          />
        ))}
        {onComment && selection.canComment && (
          <>
            <Separator
              orientation="vertical"
              className="mx-1 h-4 min-h-0 self-center"
            />
            <Tooltip
              label="Comment"
              shortcut={`${modifier}+Alt+M`}
              tooltipTriggerAsChild
              mountPortalContainer={mountPortalContainer}
              trigger={
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onComment}
                  className={cn(TOOLBAR_BUTTON_CLASS, "gap-1.5 px-2 text-sm")}
                >
                  <Icon visual={MessagePlusCircle} size="xs" />
                  Comment
                </button>
              }
            />
          </>
        )}
      </div>
    </BubbleMenu>
  );
};
