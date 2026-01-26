import { Toolbar as SparkleToolbar } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";

import { ToolBarContent } from "@app/components/assistant/conversation/input_bar/toolbar/ToolbarContent";

interface ToolbarProps {
  editor: Editor | null;
  className?: string;
  onClose?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

/** @deprecated Use @dust-tt/sparkle Toolbar with variant="overlay". */
export function MobileToolbar({ editor, className, onClose }: ToolbarProps) {
  if (!editor) {
    return null;
  }

  return (
    <SparkleToolbar variant="overlay" className={className} onClose={onClose}>
      <ToolBarContent editor={editor} />
    </SparkleToolbar>
  );
}
