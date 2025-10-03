import { AttachmentChip, DoubleQuotesIcon } from "@dust-tt/sparkle";
import { NodeViewWrapper } from "@tiptap/react";
import React from "react";

interface PastedAttachmentComponentProps {
  node: { attrs: { title?: string; fileId?: string } };
}

export function PastedAttachmentComponent({
  node,
}: PastedAttachmentComponentProps) {
  const { title } = node.attrs;
  return (
    <NodeViewWrapper className="inline-flex align-middle">
      <AttachmentChip label={title ?? "Attachment"} icon={DoubleQuotesIcon} />
    </NodeViewWrapper>
  );
}
