import { DocumentEmbedsContext } from "@app/components/editor/document/DocumentEmbeds";
import {
  findFrameEmbedDirective,
  parseFrameEmbedDirective,
  serializeFrameEmbedDirective,
} from "@app/lib/markdown/frame_embed";
import { isString } from "@app/types/shared/utils/general";
import { Node } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { useContext } from "react";

export const DOCUMENT_FRAME_NODE_NAME = "frameEmbed";

const FRAME_PATH_ATTRIBUTE = "data-document-frame";

export const DocumentFrameFallback = ({ path }: { path: string }) => (
  <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
    {path}
  </p>
);

const DocumentFrameView = ({ node }: NodeViewProps) => {
  const { renderFrame } = useContext(DocumentEmbedsContext);
  const path = isString(node.attrs.path) ? node.attrs.path : null;

  return (
    <NodeViewWrapper contentEditable={false} className="my-6">
      {path &&
        (renderFrame ? (
          renderFrame(path)
        ) : (
          <DocumentFrameFallback path={path} />
        ))}
    </NodeViewWrapper>
  );
};

/**
 * @cc [owner:tdraier,label:product;security] document-frame-embed
 * A frame embed MUST be read only from a `frame-embed-directive` line and MUST keep its path
 * through load, save, copy and paste. It MUST display only through the host's `renderFrame`, and
 * without one as its path, so the editor never loads a Frame the host did not resolve. Events
 * inside it MUST reach the Frame, not the editor.
 */
export const DocumentFrame = Node.create({
  name: DOCUMENT_FRAME_NODE_NAME,
  group: "block",
  atom: true,
  isolating: true,
  addAttributes: () => ({
    path: {
      default: null,
      rendered: false,
      parseHTML: (element) => element.getAttribute(FRAME_PATH_ATTRIBUTE),
    },
  }),
  parseHTML: () => [{ tag: `div[${FRAME_PATH_ATTRIBUTE}]` }],
  renderHTML: ({ node }) => {
    const path = isString(node.attrs.path) ? node.attrs.path : "";
    return ["div", { [FRAME_PATH_ATTRIBUTE]: path }, path];
  },
  renderText: ({ node }) => (isString(node.attrs.path) ? node.attrs.path : ""),
  addNodeView: () =>
    ReactNodeViewRenderer(DocumentFrameView, { stopEvent: () => true }),
  markdownTokenizer: {
    name: DOCUMENT_FRAME_NODE_NAME,
    level: "block",
    start: (src) => findFrameEmbedDirective(src),
    tokenize: (src) => {
      const parsed = parseFrameEmbedDirective(src);
      return parsed
        ? {
            type: DOCUMENT_FRAME_NODE_NAME,
            raw: parsed.raw,
            attrs: { path: parsed.path },
          }
        : undefined;
    },
  },
  parseMarkdown: (token) => ({
    type: DOCUMENT_FRAME_NODE_NAME,
    attrs: { path: token.attrs?.path },
  }),
  renderMarkdown: (node) =>
    isString(node.attrs?.path)
      ? serializeFrameEmbedDirective(node.attrs.path)
      : "",
});
