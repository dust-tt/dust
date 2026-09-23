import { Icon } from "@sparkle/components/Icon";
import { Tooltip } from "@sparkle/components/Tooltip";
import { Bold01, Code01, Italic01 } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { type Editor, isTextSelection } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import React from "react";

interface DocumentSelectionToolbarProps {
  editor: Editor;
  mountPortalContainer?: HTMLElement;
}

export const DocumentSelectionToolbar = ({
  editor,
  mountPortalContainer,
}: DocumentSelectionToolbarProps) => {
  const selection = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      strike: editor.isActive("strike"),
      code: editor.isActive("code"),
    }),
  });
  const isApple =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform);

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
            shortcut: isApple ? "Cmd+B" : "Ctrl+B",
            icon: Bold01,
            active: selection.bold,
            run: () => editor.chain().focus().toggleBold().run(),
          },
          {
            label: "Italic",
            shortcut: isApple ? "Cmd+I" : "Ctrl+I",
            icon: Italic01,
            active: selection.italic,
            run: () => editor.chain().focus().toggleItalic().run(),
          },
          {
            label: "Strikethrough",
            shortcut: isApple ? "Cmd+Shift+S" : "Ctrl+Shift+S",
            icon: undefined,
            active: selection.strike,
            run: () => editor.chain().focus().toggleStrike().run(),
          },
          {
            label: "Inline code",
            shortcut: isApple ? "Cmd+E" : "Ctrl+E",
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
                  "inline-flex size-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-hover hover:text-foreground motion-reduce:transition-none",
                  "aria-pressed:border-border aria-pressed:bg-selected aria-pressed:text-foreground",
                  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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
      </div>
    </BubbleMenu>
  );
};
