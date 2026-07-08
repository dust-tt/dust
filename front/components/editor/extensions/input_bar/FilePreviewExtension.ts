import { FilePreviewComponent } from "@app/components/editor/input_bar/FilePreviewComponent";
import {
  FILE_PREVIEW_DIRECTIVE_NAME,
  FILE_PREVIEW_NODE_TYPE,
  getFilePreviewMarkdownDirective,
  parseFilePreviewMarkdownDirective,
} from "@app/lib/markdown/file_preview";
import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export { FILE_PREVIEW_NODE_TYPE };

export const FilePreviewExtension = Node.create({
  name: FILE_PREVIEW_NODE_TYPE,
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      contentType: { default: null },
      path: { default: null },
      title: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="file-preview"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ "data-type": "file-preview" }, HTMLAttributes),
    ];
  },

  renderText({ node }) {
    return node.attrs.title ?? node.attrs.path ?? "[file]";
  },

  addNodeView() {
    return ReactNodeViewRenderer(FilePreviewComponent);
  },

  markdownTokenizer: {
    name: FILE_PREVIEW_NODE_TYPE,
    level: "inline",
    start: (src) => src.indexOf(`:${FILE_PREVIEW_DIRECTIVE_NAME}`),
    tokenize: (src) => {
      const parsed = parseFilePreviewMarkdownDirective(src);
      if (!parsed) {
        return undefined;
      }

      return {
        type: FILE_PREVIEW_NODE_TYPE,
        raw: parsed.raw,
        attrs: {
          contentType: parsed.contentType ?? null,
          path: parsed.path,
          title: parsed.title ?? null,
        },
      };
    },
  },

  parseMarkdown: (token) => ({
    type: FILE_PREVIEW_NODE_TYPE,
    attrs: {
      contentType: token.attrs.contentType,
      path: token.attrs.path,
      title: token.attrs.title,
    },
  }),

  renderMarkdown: (node) =>
    getFilePreviewMarkdownDirective({
      contentType: node.attrs?.contentType ?? undefined,
      path: node.attrs?.path ?? "",
      title: node.attrs?.title ?? undefined,
    }),
});
