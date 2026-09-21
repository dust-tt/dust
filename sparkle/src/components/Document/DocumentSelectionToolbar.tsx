import * as Tooltip from "@radix-ui/react-tooltip";
import { cn } from "@sparkle/lib/utils";
import { type Editor, isTextSelection } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Code, Italic, Strikethrough } from "lucide-react";
import React from "react";

interface DocumentSelectionToolbarProps {
  editor: Editor;
}

export const DocumentSelectionToolbar = ({
  editor,
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
    <Tooltip.Provider delayDuration={450}>
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
              shortcut: isApple ? "⌘ B" : "Ctrl B",
              icon: Bold,
              active: selection.bold,
              run: () => editor.chain().focus().toggleBold().run(),
            },
            {
              label: "Italic",
              shortcut: isApple ? "⌘ I" : "Ctrl I",
              icon: Italic,
              active: selection.italic,
              run: () => editor.chain().focus().toggleItalic().run(),
            },
            {
              label: "Strikethrough",
              shortcut: isApple ? "⌘ ⇧ S" : "Ctrl Shift S",
              icon: Strikethrough,
              active: selection.strike,
              run: () => editor.chain().focus().toggleStrike().run(),
            },
            {
              label: "Inline code",
              shortcut: isApple ? "⌘ E" : "Ctrl E",
              icon: Code,
              active: selection.code,
              run: () => editor.chain().focus().toggleCode().run(),
            },
          ].map(({ label, shortcut, icon: Icon, active, run }) => (
            <Tooltip.Root key={label}>
              <Tooltip.Trigger asChild>
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
                  <Icon size={16} aria-hidden="true" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="bottom"
                  sideOffset={8}
                  className="relative z-60 flex items-center gap-3 rounded-md border border-border bg-overlay-background px-2.5 py-1.5 font-sans text-foreground copy-xs antialiased print:hidden"
                >
                  <span>{label}</span>
                  <kbd className="font-sans text-muted-foreground text-xs">
                    {shortcut}
                  </kbd>
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          ))}
        </div>
      </BubbleMenu>
    </Tooltip.Provider>
  );
};
