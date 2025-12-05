import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { PastedAttachmentComponent } from "../../input_bar/PastedAttachmentComponent";

interface PastedAttachmentOptions {
  onInlineText?: (fileId: string, textContent: string) => void;
}

// Regex to match :pasted_content[title]{pastedId=fileId}
const PASTED_ATTACHMENT_REGEX_BEGINNING =
  /^:pasted_content\[([^\]]+)]\{pastedId=([^}]+)}/;

export const PastedAttachmentExtension = Node.create<PastedAttachmentOptions>({
  name: "pastedAttachment",
  group: "inline",
  inline: true,
  atom: true,

  addOptions() {
    return {
      onInlineText: undefined,
    };
  },

  addAttributes() {
    return {
      fileId: { default: null },
      title: { default: null },
      textContent: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="pasted-attachment"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ "data-type": "pasted-attachment" }, HTMLAttributes),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PastedAttachmentComponent);
  },

  // Define a custom Markdown tokenizer to recognize :pasted_content: syntax
  markdownTokenizer: {
    name: "pastedAttachment",
    level: "inline", // inline element
    // Fast hint for the lexer to find candidate positions
    start: (src) => src.indexOf(":pasted_content"),
    tokenize: (src) => {
      const match = PASTED_ATTACHMENT_REGEX_BEGINNING.exec(src);
      if (!match) {
        return undefined;
      }

      return {
        type: "pastedAttachment", // token type (must match name)
        raw: match[0], // full matched string
        attrs: {
          title: match[1],
          fileId: match[2],
        },
      };
    },
  },

  parseMarkdown: (token) => {
    return {
      type: "pastedAttachment",
      attrs: {
        title: token.attrs.title,
        fileId: token.attrs.fileId,
      },
    };
  },

  renderMarkdown: (node) => {
    const title = node.attrs?.title ?? "";
    const fileId = node.attrs?.fileId ?? "";
    return `:pasted_content[${title}]{pastedId=${fileId}}`;
  },
});
