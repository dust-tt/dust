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

  return (
    <NodeViewWrapper
      className="inline-flex align-middle"
      style={{ maxWidth: "none" }}
    >
      <AttachmentChip
        label={title ?? "Attachment"}
        icon={DoubleQuotesIcon}
        actionButton={
          fileId && onInlineText && textContent
            ? {
                label: "Inline",
                onClick: () => onInlineText(fileId, textContent),
                tooltip: "Insert the content of this attachment as text",
              }
            : undefined
        }
      />
    </NodeViewWrapper>
  );
}
