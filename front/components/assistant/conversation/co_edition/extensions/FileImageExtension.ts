import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { FileImageComponent } from "@app/components/assistant/conversation/co_edition/components/FileImageComponent";
import type { CoEditionImageNode } from "@app/components/assistant/conversation/co_edition/tools/editor/types";

interface FileImageOptions {
  workspaceId: string;
}

const FileImageExtension = Node.create<FileImageOptions>({
  name: "fileImage",
  group: "block",
  atom: true,

  addOptions() {
    return {
      workspaceId: "",
    };
  },

  addAttributes() {
    return {
      fileId: {
        default: null,
      },
      alt: {
        default: "",
      },
      src: {
        default: null,
        // This gets called when the node is rendered.
        renderHTML: (attributes) => {
          const fileId = attributes.fileId;
          if (!fileId) {
            return {};
          }

          // Access workspaceId from options.
          const workspaceId = this.options.workspaceId;
          return {
            src: `/api/w/${workspaceId}/files/${fileId}?action=view`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "img[data-dust-file-id]",
        getAttrs: (node) => {
          if (typeof node === "string") {
            return false;
          }
          return {
            fileId: node.getAttribute("data-dust-file-id"),
            alt: node.getAttribute("alt"),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(this.options, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileImageComponent);
  },
});

export function imageContentToNode(content: CoEditionImageNode) {
  return {
    type: "fileImage",
    attrs: {
      fileId: content.fileId,
      alt: content.alt,
    },
  };
}
