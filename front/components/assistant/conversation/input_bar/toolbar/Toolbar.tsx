import { cn } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";

import { ToolBarContent } from "@app/components/assistant/conversation/input_bar/toolbar/ToolbarContent";

interface ToolbarProps {
  editor: Editor | null;
  className?: string;
}

export function Toolbar({ editor, className }: ToolbarProps) {
  if (!editor) {
    return null;
  }

  return (
    <div
      className={cn(
        "gap-1 border-b border-t border-border bg-background p-1 dark:border-border-night/50 dark:bg-background-night sm:rounded-2xl sm:border sm:border-border/50 sm:shadow-md",
        className
      )}
    >
      <ToolBarContent editor={editor} />
    </div>
  );
}
