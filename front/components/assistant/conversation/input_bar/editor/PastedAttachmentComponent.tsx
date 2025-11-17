import { AttachmentChip, DoubleQuotesIcon } from "@dust-tt/sparkle";
import { NodeViewWrapper } from "@tiptap/react";
import React from "react";

interface PastedAttachmentComponentProps {
  node: { attrs: { title?: string; fileId?: string; textContent?: string } };
  extension: {
    options: {
      onInlineText?: (fileId: string, textContent: string) => void;
    };
  };
}

export function PastedAttachmentComponent({
  node,
  extension,
}: PastedAttachmentComponentProps) {
  const { title, fileId, textContent } = node.attrs;
  const { onInlineText } = extension.options;

  const handleClick = () => {
    if (fileId && onInlineText && textContent) {
      onInlineText(fileId, textContent);
    }
  };

  const displayTitle = (title ?? "Pasted Attachment") + " (click to inline)";
  return (
    <NodeViewWrapper className="inline-flex align-middle">
      <div
        onClick={handleClick}
        className={
          fileId && onInlineText && textContent ? "cursor-pointer" : undefined
        }
      >
        <AttachmentChip label={displayTitle} icon={DoubleQuotesIcon} />
      </div>
    </NodeViewWrapper>
  );
}
