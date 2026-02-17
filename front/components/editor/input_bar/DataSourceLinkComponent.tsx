import { AttachmentChip } from "@dust-tt/sparkle";
import { NodeViewWrapper } from "@tiptap/react";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React from "react";

export const DataSourceLinkComponent = ({ node }: { node: { attrs: any } }) => {
  const { title, url } = node.attrs;

  return (
    <NodeViewWrapper className="inline-flex align-middle">
      <AttachmentChip label={title} href={url} target="_blank" color="white" />
    </NodeViewWrapper>
  );
};
