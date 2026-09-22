import { cn } from "@sparkle/lib/utils";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import React, { createContext, useContext } from "react";
import { DocumentFrame, DocumentFrameReferenceSchema } from "./DocumentFrame";
import type { DocumentProps } from "./types";

export const DocumentFrameRendererContext =
  createContext<DocumentProps["renderFrame"]>(undefined);

/**
 * @cc [owner:flvndvd,label:product] document-frame-block-interaction
 * Editable Frame blocks MUST be draggable from their header. Interacting with the
 * embedded content MUST NOT edit the document. Read-only blocks MUST NOT be movable.
 */
const DocumentFrameView = ({ node, selected }: NodeViewProps) => {
  const renderFrame = useContext(DocumentFrameRendererContext);
  const reference = DocumentFrameReferenceSchema.safeParse(node.attrs);

  return (
    <NodeViewWrapper
      contentEditable={false}
      className={cn(
        "my-6 overflow-hidden rounded-xl border border-border bg-background",
        selected && "ring-2 ring-ring"
      )}
    >
      {reference.success ? (
        <section aria-label={reference.data.title ?? "Embedded Frame"}>
          <div
            data-drag-handle=""
            className="border-b border-border bg-muted-background px-4 py-2 text-muted-foreground copy-xs"
          >
            {reference.data.title ?? "Frame"}
          </div>
          {renderFrame ? (
            renderFrame(reference.data)
          ) : (
            <p className="p-6 text-muted-foreground copy-sm">
              This Frame is unavailable in this view.
            </p>
          )}
        </section>
      ) : (
        <p role="alert" className="p-6 text-muted-foreground copy-sm">
          This Frame reference is invalid.
        </p>
      )}
    </NodeViewWrapper>
  );
};

export const DocumentFrameWithView = DocumentFrame.extend({
  addNodeView: () => ReactNodeViewRenderer(DocumentFrameView),
});
