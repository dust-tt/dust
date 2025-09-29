import { AttachmentChip, DoubleQuotesIcon } from "@dust-tt/sparkle";
import { NodeViewWrapper } from "@tiptap/react";
import React from "react";

export function PastedAttachmentComponent({
  node,
}: {
  node: { attrs: { title?: string } };
}) {
  const { title } = node.attrs;
  return (
    <NodeViewWrapper className="inline-flex align-middle">
      <AttachmentChip label={title ?? "Attachment"} icon={DoubleQuotesIcon} />
    </NodeViewWrapper>
  );
}
