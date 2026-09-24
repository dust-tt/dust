import { cn } from "@sparkle/lib/utils";
import { Node } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import React, { createContext, useContext } from "react";
import { z } from "zod";
import type { DocumentProps } from "./types";

export const DocumentVisualsContext =
  createContext<DocumentProps["visuals"]>(undefined);

const visualNameSchema = z.string().min(1);

const DocumentVisualView = ({ node, selected }: NodeViewProps) => {
  const visuals = useContext(DocumentVisualsContext);
  const name: string = node.attrs.name;
  const visual =
    visuals && Object.hasOwn(visuals, name) ? visuals[name] : undefined;

  return (
    <NodeViewWrapper
      contentEditable={false}
      className={cn("my-6", selected && "rounded-lg ring-2 ring-ring")}
    >
      {visual ?? (
        <p
          role="status"
          className="rounded-lg border border-border p-4 text-muted-foreground copy-sm"
        >
          Visual “{name}” is unavailable.
        </p>
      )}
    </NodeViewWrapper>
  );
};

/**
 * @cc [owner:flvndvd,label:product] document-visual-reference
 * Visual blocks MUST persist only their name. Rendering MUST use the host's named React node.
 * Missing renderers MUST leave the reference intact and show a placeholder.
 */
export const DocumentVisual = Node.create({
  name: "dustVisual",
  group: "block",
  atom: true,
  isolating: true,
  addAttributes: () => ({
    name: {
      default: null,
      validate: (value: unknown) => {
        visualNameSchema.parse(value);
      },
      parseHTML: (element) => element.getAttribute("data-document-visual"),
      renderHTML: (attributes) => ({ "data-document-visual": attributes.name }),
    },
  }),
  parseHTML: () => [{ tag: "div[data-document-visual]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", HTMLAttributes],
  addNodeView() {
    const editor = this.editor;

    return ReactNodeViewRenderer(DocumentVisualView, {
      stopEvent: ({ event }) => {
        switch (event.type) {
          case "mousemove":
          case "mouseleave":
            return false;
          case "dragover":
          case "dragenter":
          case "drop":
            return editor.view.dragging === null;
          default:
            return true;
        }
      },
    });
  },
});
