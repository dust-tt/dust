import { DataSourceLinkComponent } from "@app/components/editor/input_bar/DataSourceLinkComponent";
import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

// Matches :content_node_mention[title]{url="..."}. The value is quoted since
// remark-directive stops an unquoted value at "=". Unquoted is still parsed.
const DATA_SOURCE_LINK_REGEX_BEGINNING =
  /^:content_node_mention\[([^\]]+)](\{url="?([^"}]+)"?})?/;

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

  renderText({ node }) {
    return node.attrs.url ?? "[link]";
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
      },
    };
  },

  renderMarkdown: (node) => {
    const title = node.attrs?.title ?? "";
    const url = node.attrs?.url;
    return url
      ? `:content_node_mention[${title}]{url="${url}"}`
      : `:content_node_mention[${title}]`;
  },
});
