import { cn } from "@sparkle/lib/utils";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import React, { createContext, useContext } from "react";
import {
  DocumentVisual,
  DocumentVisualReferenceSchema,
} from "./DocumentVisual";
import type { DocumentProps } from "./types";

export const DocumentVisualRendererContext =
  createContext<DocumentProps["renderVisual"]>(undefined);

/** The host renders visual code in its own environment, outside the editable prose. */
const DocumentVisualView = ({ node, selected, editor }: NodeViewProps) => {
  const renderVisual = useContext(DocumentVisualRendererContext);
  const reference = DocumentVisualReferenceSchema.safeParse(node.attrs);
  const rendered = reference.success ? renderVisual?.(reference.data) : null;
  return (
    <NodeViewWrapper
      contentEditable={false}
      className={cn("my-8", selected && "rounded-lg ring-2 ring-ring")}
    >
      {editor.isEditable && (
        <div
          data-drag-handle=""
          className="mb-2 inline-flex cursor-grab select-none rounded-md bg-muted-background px-2 py-1 font-sans text-muted-foreground copy-xs"
        >
          Visual · {reference.success ? reference.data.name : "Unavailable"}
        </div>
      )}
      {rendered ?? (
        <p
          role="status"
          className="rounded-lg border border-border bg-background p-5 font-sans text-muted-foreground copy-sm"
        >
          This visual is unavailable in this view.
        </p>
      )}
    </NodeViewWrapper>
  );
};

export const DocumentVisualWithView = DocumentVisual.extend({
  addNodeView: () => ReactNodeViewRenderer(DocumentVisualView),
});
