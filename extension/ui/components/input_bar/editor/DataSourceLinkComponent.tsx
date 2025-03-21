import { Chip } from "@dust-tt/sparkle";
import { NodeViewWrapper } from "@tiptap/react";

export const DataSourceLinkComponent = ({ node }: { node: { attrs: any } }) => {
  const { title, url } = node.attrs;

  return (
    <NodeViewWrapper className="inline-flex align-middle">
      <Chip label={title} size="xs" color="sky" href={url} target="_blank" />
    </NodeViewWrapper>
  );
};
