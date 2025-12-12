import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { DataSourceLinkComponent } from "@app/components/editor/input_bar/DataSourceLinkComponent";

// Regex to match :content_node_mention[title]{url=...}
const DATA_SOURCE_LINK_REGEX_BEGINNING =
  /^:content_node_mention\[([^\]]+)](\{url=([^}]+)})?/;

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

  // Define a custom Markdown tokenizer to recognize `:content_node_mention[]{url=}`
  markdownTokenizer: {
    name: "dataSourceLink",
    level: "inline", // inline element
    start: (src) => src.indexOf(":content_node_mention"),
    tokenize: (src) => {
      const match = DATA_SOURCE_LINK_REGEX_BEGINNING.exec(src);
      if (!match) {
        return undefined;
      }

      return {
        type: "dataSourceLink", // token type (must match name)
        raw: match[0], // full matched string
        attrs: {
          title: match[1],
          url: match[2] && match[3] ? match[3] : "",
          nodeId: match[4] && match[5] ? match[5] : "",
        },
      };
    },
  },

  parseMarkdown: (token) => {
    return {
      type: "dataSourceLink",
      attrs: {
        title: token.attrs.title,
        url: token.attrs.url,
        nodeId: token.attrs.nodeId,
      },
    };
  },

  renderMarkdown: (node) => {
    return `:content_node_mention[${node.attrs?.title ?? ""}]{nodeId=${node.attrs?.nodeId ?? ""}}`;
  },
});
