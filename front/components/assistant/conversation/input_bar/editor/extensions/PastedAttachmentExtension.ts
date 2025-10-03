import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { PastedAttachmentComponent } from "../PastedAttachmentComponent";

export const PastedAttachmentExtension = Node.create({
  name: "pastedAttachment",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      fileId: { default: null },
      title: { default: null },
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
});
