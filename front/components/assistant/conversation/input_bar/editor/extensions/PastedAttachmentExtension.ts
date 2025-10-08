import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { PastedAttachmentComponent } from "../PastedAttachmentComponent";

export interface PastedAttachmentOptions {
  onInlineText?: (fileId: string, textContent: string) => void;
}

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
});
