import { DocumentEmbedsContext } from "@app/components/editor/document/DocumentEmbeds";
import type { DocumentFilePreview as FilePreview } from "@app/components/editor/document/types";
import {
  FILE_PREVIEW_DIRECTIVE_NAME,
  getFileNameFromScopedPath,
  parseFilePreviewMarkdownDirective,
  serializeFilePreviewMarkdownDirective,
} from "@app/lib/markdown/file_preview";
import { isString } from "@app/types/shared/utils/general";
import { Node } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { useContext } from "react";

export const DOCUMENT_FILE_PREVIEW_NODE_NAME = "filePreview";

const FILE_PREVIEW_PATH_ATTRIBUTE = "data-document-file-preview";

const FILE_PREVIEW_ATTRIBUTES = new Set(["path", "title", "contentType"]);

const filePreviewOf = (attrs: Record<string, unknown>): FilePreview | null =>
  isString(attrs.path) && attrs.path
    ? {
        path: attrs.path,
        title: isString(attrs.title) ? attrs.title : null,
        contentType: isString(attrs.contentType) ? attrs.contentType : null,
      }
    : null;

const filePreviewLabel = ({ path, title }: FilePreview) =>
  title || getFileNameFromScopedPath(path);

export const DocumentFilePreviewFallback = ({
  preview,
}: {
  preview: FilePreview;
}) => (
  <span className="rounded border border-dashed border-border px-1.5 py-0.5 text-sm text-muted-foreground">
    {filePreviewLabel(preview)}
  </span>
);

const DocumentFilePreviewView = ({ node }: NodeViewProps) => {
  const { renderFilePreview } = useContext(DocumentEmbedsContext);
  const preview = filePreviewOf(node.attrs);

  return (
    <NodeViewWrapper as="span" contentEditable={false}>
      {preview &&
        (renderFilePreview ? (
          renderFilePreview(preview)
        ) : (
          <DocumentFilePreviewFallback preview={preview} />
        ))}
    </NodeViewWrapper>
  );
};

/**
 * @cc [owner:tdraier,label:product] document-file-preview
 * A `:preview_file` directive MUST be read only when its attributes are among `path`, `title` and
 * `contentType`, on one line, and MUST keep them through load, save, copy and paste; any other
 * stays text, so saving never drops an attribute. It MUST display only through the host's
 * `renderFilePreview`, and without one as its title, or its file name when it has no title.
 */
export const DocumentFilePreview = Node.create({
  name: DOCUMENT_FILE_PREVIEW_NODE_NAME,
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => ({
    path: {
      default: null,
      rendered: false,
      parseHTML: (element) => element.getAttribute(FILE_PREVIEW_PATH_ATTRIBUTE),
    },
    title: {
      default: null,
      rendered: false,
      parseHTML: (element) => element.getAttribute("data-title"),
    },
    contentType: {
      default: null,
      rendered: false,
      parseHTML: (element) => element.getAttribute("data-content-type"),
    },
  }),
  parseHTML: () => [{ tag: `span[${FILE_PREVIEW_PATH_ATTRIBUTE}]` }],
  renderHTML: ({ node }) => {
    const preview = filePreviewOf(node.attrs);
    return [
      "span",
      {
        [FILE_PREVIEW_PATH_ATTRIBUTE]: preview?.path ?? "",
        ...(preview?.title ? { "data-title": preview.title } : {}),
        ...(preview?.contentType
          ? { "data-content-type": preview.contentType }
          : {}),
      },
      preview ? filePreviewLabel(preview) : "",
    ];
  },
  renderText: ({ node }) => {
    const preview = filePreviewOf(node.attrs);
    return preview ? filePreviewLabel(preview) : "";
  },
  addNodeView: () =>
    ReactNodeViewRenderer(DocumentFilePreviewView, { as: "span" }),
  markdownTokenizer: {
    name: DOCUMENT_FILE_PREVIEW_NODE_NAME,
    level: "inline",
    start: (src) => src.indexOf(`:${FILE_PREVIEW_DIRECTIVE_NAME}{`),
    tokenize: (src) => {
      const parsed = parseFilePreviewMarkdownDirective(src);
      if (
        !parsed ||
        /[\r\n]/.test(parsed.raw) ||
        parsed.attributeNames.some((name) => !FILE_PREVIEW_ATTRIBUTES.has(name))
      ) {
        return undefined;
      }
      return {
        type: DOCUMENT_FILE_PREVIEW_NODE_NAME,
        raw: parsed.raw,
        attrs: {
          path: parsed.path,
          title: parsed.title || null,
          contentType: parsed.contentType || null,
        },
      };
    },
  },
  parseMarkdown: (token) => ({
    type: DOCUMENT_FILE_PREVIEW_NODE_NAME,
    attrs: token.attrs,
  }),
  renderMarkdown: (node) => {
    const preview = filePreviewOf(node.attrs ?? {});
    return preview
      ? serializeFilePreviewMarkdownDirective({
          path: preview.path,
          title: preview.title ?? undefined,
          contentType: preview.contentType ?? undefined,
        })
      : "";
  },
});
