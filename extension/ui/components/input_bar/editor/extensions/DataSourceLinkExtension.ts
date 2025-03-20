import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { DataSourceLinkComponent } from "../DataSourceLinkComponent";

export const DataSourceLinkExtension = Node.create({
  name: "dataSourceLink",
  group: "inline",
  inline: true,
  atom: true, // Makes it a single unit

  addAttributes() {
    return {
      nodeId: { default: null },
      title: { default: null },
      provider: { default: null },
      spaceId: { default: null },
      url: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="data-source-link"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ "data-type": "data-source-link" }, HTMLAttributes),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DataSourceLinkComponent);
  },
});
