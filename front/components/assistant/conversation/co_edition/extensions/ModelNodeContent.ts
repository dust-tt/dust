import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { ModelNodeContentView } from "../views/ModelNodeContentView";

export interface ModelNodeContentOptions {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    modelNodeContent: {
      /**
       * Add a model node content block
       */
      setModelNodeContent: (attributes: { content: string }) => ReturnType;
    };
  }
}

export const ModelNodeContent = Node.create<ModelNodeContentOptions>({
  name: "modelNodeContent",

  group: "block",

  content: "block+",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      timestamp: {
        default: null,
      },
      content: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="model-node-content"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { "data-type": "model-node-content", ...HTMLAttributes }, 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ModelNodeContentView);
  },

  addCommands() {
    return {
      setModelNodeContent:
        (attributes) =>
        ({ commands }) => {
          const { content } = attributes;

          // Create a temporary div to parse the HTML content
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = content;

          // Extract text content and preserve basic formatting
          const textContent = tempDiv.textContent || "";
          const hasHeading =
            tempDiv.querySelector("h1, h2, h3, h4, h5, h6") !== null;

          // Create the content structure
          const contentStructure = [];

          if (hasHeading) {
            contentStructure.push({
              type: "heading",
              attrs: { level: 2 },
              content: [{ type: "text", text: textContent }],
            });
          } else {
            contentStructure.push({
              type: "paragraph",
              content: [{ type: "text", text: textContent }],
            });
          }

          return commands.insertContent({
            type: this.name,
            attrs: {
              timestamp: new Date().toISOString(),
              content: {
                text: textContent,
                heading: hasHeading ? textContent : undefined,
              },
            },
            content: contentStructure,
          });
        },
    };
  },
});
