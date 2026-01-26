import { Toolbar as SparkleToolbar } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";

import { ToolBarContent } from "@app/components/assistant/conversation/input_bar/toolbar/ToolbarContent";

interface ToolbarProps {
  editor: Editor | null;
  className?: string;
}

/** @deprecated Use @dust-tt/sparkle Toolbar directly. */
export function Toolbar({ editor, className }: ToolbarProps) {
  if (!editor) {
    return null;
  }

  return (
    <SparkleToolbar className={className}>
      <ToolBarContent editor={editor} />
    </SparkleToolbar>
  );
}
