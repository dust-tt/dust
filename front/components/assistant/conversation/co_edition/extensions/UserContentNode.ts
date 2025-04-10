import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { UserContentView } from "@app/components/assistant/conversation/co_edition/views/UserContentView";

export interface UserContentOptions {
  HTMLAttributes: Record<string, any>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    userContent: {
      setUserContent: (attributes: { content: string }) => ReturnType;
    };
  }
}

export const UserContentNode = Node.create<UserContentOptions>({
  name: "userContent",

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
        tag: 'div[data-type="user-content"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { "data-type": "user-content", ...HTMLAttributes }, 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(UserContentView);
  },

  addCommands() {
    return {
      setUserContent:
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
