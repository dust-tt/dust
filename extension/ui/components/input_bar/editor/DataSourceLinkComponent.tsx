import { AttachmentChip } from "@dust-tt/sparkle";
import { NodeViewWrapper } from "@tiptap/react";

export const DataSourceLinkComponent = ({ node }: { node: { attrs: any } }) => {
  const { title } = node.attrs;

  return (
    <NodeViewWrapper className="inline-flex align-middle">
      <AttachmentChip label={title} />
    </NodeViewWrapper>
  );
};
