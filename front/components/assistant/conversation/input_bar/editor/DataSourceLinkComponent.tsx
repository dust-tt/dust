import { Chip } from "@dust-tt/sparkle";
import { NodeViewWrapper } from "@tiptap/react";
import React from "react";

export const DataSourceLinkComponent = ({ node }: { node: { attrs: any } }) => {
  const { title } = node.attrs;

  return (
    <NodeViewWrapper className="inline-flex align-middle">
      <Chip label={title} size="xs" color="sky" />
    </NodeViewWrapper>
  );
};
