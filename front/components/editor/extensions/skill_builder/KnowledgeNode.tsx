import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { KnowledgeNodeView } from "./KnowledgeNodeView";

export interface KnowledgeItem {
  id: string;
  label: string;
  description?: string;
}

export interface KnowledgeNodeAttributes {
  selectedItems: KnowledgeItem[];
  isSearching: boolean;
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

  renderHTML({ node, HTMLAttributes }) {
    const { selectedItems } = node.attrs;

    if (selectedItems.length > 0) {
      // Render selected knowledge as a chip.
      // TODO(2026-01-02 SKILLS): Use the same chip as the url one in the input bar.
      return [
        "span",
        mergeAttributes(
          {
            "data-type": "knowledge-node",
            class:
              "inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm",
          },
          HTMLAttributes
        ),
        ["span", { class: "emoji" }, "📚"],
        ["span", {}, selectedItems[0].label],
      ];
    }

    // Render editable search container.
    return [
      "span",
      mergeAttributes(
        {
          "data-type": "knowledge-node",
          class:
            "inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded-md text-sm italic",
          contenteditable: "true",
        },
        HTMLAttributes
      ),
      ["span", { class: "emoji" }, "🔍"],
      0, // This allows text content inside.
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
