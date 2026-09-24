import { Icon } from "@sparkle/components/Icon";
import { Tooltip } from "@sparkle/components/Tooltip";
import { Menu01 } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import type { Editor } from "@tiptap/core";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import React, { useRef } from "react";

interface DocumentDragHandleProps {
  editor: Editor;
  mountPortalContainer?: HTMLElement;
}

/**
 * @cc [owner:flvndvd,label:product] document-block-reordering
 * Block moves MUST participate in undo, redo and autosave while preserving their content,
 * comment marks and visual references. Read-only documents MUST NOT expose a drag handle.
 * Clicking the handle MUST select its block.
 */
export const DocumentDragHandle = ({
  editor,
  mountPortalContainer,
}: DocumentDragHandleProps) => {
  const blockPosition = useRef<number | null>(null);

  const selectBlock = () => {
    if (editor.isEditable && blockPosition.current !== null) {
      editor.chain().setNodeSelection(blockPosition.current).focus().run();
    }
  };

  return (
    <DragHandle
      editor={editor}
      className="pr-2 print:hidden"
      onNodeChange={({ node, pos }) => {
        blockPosition.current = node ? pos : null;
      }}
    >
      <Tooltip
        label="Drag to move, click to select"
        tooltipTriggerAsChild
        mountPortalContainer={mountPortalContainer}
        trigger={
          <button
            type="button"
            aria-label="Move block"
            onClick={selectBlock}
            className={cn(
              "flex h-7 w-5 cursor-grab items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground active:cursor-grabbing motion-reduce:transition-none",
              "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            <span aria-hidden="true">
              <Icon visual={Menu01} size="xs" />
            </span>
          </button>
        }
      />
    </DragHandle>
  );
};
