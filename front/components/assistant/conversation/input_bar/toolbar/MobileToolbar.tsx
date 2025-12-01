import { Button, cn, ScrollArea, XMarkIcon } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";

import { ToolBarContent } from "@app/components/assistant/conversation/input_bar/toolbar/ToolbarContent";

interface ToolbarProps {
  editor: Editor | null;
  className?: string;
  onClose?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export function MobileToolbar({ editor, className, onClose }: ToolbarProps) {
  if (!editor) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute left-0 top-0 z-10 inline-flex items-center justify-start gap-3 overflow-hidden rounded-xl bg-primary-50 py-1 pl-3 duration-700 ease-in-out dark:bg-muted-background-night",
        className
      )}
    >
      <Button
        size="mini"
        variant="outline"
        icon={XMarkIcon}
        onClick={onClose}
      />
      <ScrollArea
        orientation="horizontal"
        className="h-full w-full border-l border-border dark:border-border-night/50"
        hideScrollBar
      >
        <div
          id="Scrollable"
          className="flex h-full w-max flex-row items-center gap-3 overflow-x-scroll px-3"
        >
          <ToolBarContent editor={editor} />
        </div>
      </ScrollArea>
    </div>
  );
}
