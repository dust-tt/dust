import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { KnowledgeNodeView } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";

export interface KnowledgeItem {
  description?: string;
  id: string;
  label: string;
}

export interface KnowledgeNodeAttributes {
  isSearching: boolean;
  selectedItems: KnowledgeItem[];
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    knowledgeNode: {
      insertKnowledgeNode: () => ReturnType;
    };
  }
}

export const KnowledgeNode = Node.create<{}>({
  name: "knowledgeNode",

  group: "inline",
  inline: true,
  atom: false, // Make it editable.
  selectable: false, // Allow text cursor inside.

  addAttributes() {
    return {
      selectedItems: {
        default: [],
        parseHTML: (element) => {
          const data = element.getAttribute("data-selected-items");
          return data ? JSON.parse(data) : [];
        },
        renderHTML: (attributes) => ({
          "data-selected-items": JSON.stringify(attributes.selectedItems),
        }),
      },
      isSearching: {
        default: true,
        parseHTML: (element) => {
          const data = element.getAttribute("data-is-searching");
          return data === "true";
        },
        renderHTML: (attributes) => ({
          "data-is-searching": attributes.isSearching.toString(),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="knowledge-node"]',
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(KnowledgeNodeView);
  },

  addCommands() {
    return {
      insertKnowledgeNode:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              selectedItems: [],
              isSearching: true,
            },
          });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Allow normal editing behavior.
    };
  },
});
