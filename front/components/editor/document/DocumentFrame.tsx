import { DocumentEmbedsContext } from "@app/components/editor/document/DocumentEmbeds";
import { DocumentFrameMenu } from "@app/components/editor/document/DocumentFrameMenu";
import { asOwnUndoStep } from "@app/components/editor/document/undoSteps";
import {
  findFrameEmbedDirective,
  isFrameEmbedPath,
  parseFrameEmbedDirective,
  parseFrameEmbedHeight,
  serializeFrameEmbedDirective,
} from "@app/lib/markdown/frame_embed";
import { isString } from "@app/types/shared/utils/general";
import { Node } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { useContext, useState } from "react";

export const DOCUMENT_FRAME_NODE_NAME = "frameEmbed";

const DEFAULT_FRAME_HEIGHT_PX = 600;

const FRAME_PATH_ATTRIBUTE = "data-document-frame";
const FRAME_HEIGHT_ATTRIBUTE = "data-height";

export interface DocumentFramePathProps {
  path: string;
}

export const DocumentFrameFallback = ({ path }: DocumentFramePathProps) => (
  <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
    {path}
  </p>
);

interface DocumentFrameDisplayProps extends DocumentFramePathProps {
  height: number | null;
}

export const DocumentFrameDisplay = ({
  path,
  height,
}: DocumentFrameDisplayProps) => {
  const { renderFrame } = useContext(DocumentEmbedsContext);

  return renderFrame ? (
    <>{renderFrame(path, height ?? DEFAULT_FRAME_HEIGHT_PX)}</>
  ) : (
    <DocumentFrameFallback path={path} />
  );
};

/**
 * @cc [owner:tdraier,label:product] document-frame-menu
 * In an editable document, hovering a Frame MUST show, at its top right, a menu with a height
 * slider from 200px to 1600px and an action to remove it that leaves the editor focused. Dragging
 * the slider MUST preview the height and save it once, on release, so each action is its own
 * undoable edit, never merged with the edits around it, that changes only the hovered Frame. A
 * drag ending without a change MUST restore the Frame's height.
 * The menu MUST stay while the pointer is on the Frame or the slider is dragged, and hide otherwise.
 */
const DocumentFrameView = ({
  node,
  editor,
  updateAttributes,
  deleteNode,
}: NodeViewProps) => {
  const { editable } = useContext(DocumentEmbedsContext);
  const [hovering, setHovering] = useState(false);
  const [draftHeight, setDraftHeight] = useState<number | null>(null);
  const path = isString(node.attrs.path) ? node.attrs.path : null;
  const height = draftHeight ?? parseFrameEmbedHeight(node.attrs.height);

  const commitHeight = (nextHeight: number) => {
    setDraftHeight(null);
    asOwnUndoStep(editor, () => updateAttributes({ height: nextHeight }));
  };

  return (
    <NodeViewWrapper
      contentEditable={false}
      className="relative my-6"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {path && <DocumentFrameDisplay path={path} height={height} />}
      {editable && (hovering || draftHeight !== null) && (
        <DocumentFrameMenu
          height={height ?? DEFAULT_FRAME_HEIGHT_PX}
          onPreviewHeight={setDraftHeight}
          onEndPreview={() => setDraftHeight(null)}
          onCommitHeight={commitHeight}
          onRemove={() => {
            asOwnUndoStep(editor, deleteNode);
            editor.commands.focus();
          }}
        />
      )}
    </NodeViewWrapper>
  );
};

/**
 * @cc [owner:tdraier,label:product;security] document-frame-embed
 * A frame embed MUST be read only from a `frame-embed-directive` line, never as a list item's
 * first block, which the schema holds only as a paragraph, and MUST keep its path and height
 * through load, save, copy and paste. Pasted content MUST NOT create one whose path
 * `isFrameEmbedPath` refuses. It MUST display only through the host's `renderFrame`, at its height
 * or 600px without one, and without a renderer as its path, so the editor never loads a Frame the
 * host did not resolve. Events inside it MUST reach the Frame, not
 * the editor.
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
    height: {
      default: null,
      rendered: false,
      parseHTML: (element) =>
        parseFrameEmbedHeight(element.getAttribute(FRAME_HEIGHT_ATTRIBUTE)),
    },
  }),
  parseHTML: () => [
    {
      tag: `div[${FRAME_PATH_ATTRIBUTE}]`,
      getAttrs: (element) =>
        isFrameEmbedPath(element.getAttribute(FRAME_PATH_ATTRIBUTE) ?? "")
          ? null
          : false,
    },
  ],
  renderHTML: ({ node }) => {
    const path = isString(node.attrs.path) ? node.attrs.path : "";
    const height = parseFrameEmbedHeight(node.attrs.height);
    return [
      "div",
      {
        [FRAME_PATH_ATTRIBUTE]: path,
        ...(height ? { [FRAME_HEIGHT_ATTRIBUTE]: String(height) } : {}),
      },
      path,
    ];
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
            attrs: { path: parsed.path, height: parsed.height },
          }
        : undefined;
    },
  },
  parseMarkdown: (token) => ({
    type: DOCUMENT_FRAME_NODE_NAME,
    attrs: { path: token.attrs?.path, height: token.attrs?.height },
  }),
  renderMarkdown: (node) =>
    isString(node.attrs?.path)
      ? serializeFrameEmbedDirective(
          node.attrs.path,
          parseFrameEmbedHeight(node.attrs.height)
        )
      : "",
});
