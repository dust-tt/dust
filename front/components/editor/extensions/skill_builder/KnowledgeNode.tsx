import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { KnowledgeNodeView } from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";

export interface KnowledgeItem {
  description?: string;
  id: string;
  label: string;
  node?: DataSourceViewContentNode;
  spaceId?: string;
  dataSourceViewId?: string;
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

  markdownTokenizer: {
    name: "knowledgeNode",
    level: "inline",
    start: (src) => {
      return src.indexOf("<knowledge");
    },
    tokenize: (src) => {
      const match = /^<knowledge\s+([^>]+)\s*\/>/.exec(src);
      if (!match) {
        return undefined;
      }

      const attributesString = match[1];
      const idMatch = attributesString.match(/id="([^"]+)"/);
      const titleMatch = attributesString.match(/title="([^"]+)"/);
      const spaceMatch = attributesString.match(/space="([^"]*)"/);
      const dsvMatch = attributesString.match(/dsv="([^"]*)"/);

      if (!idMatch || !titleMatch) {
        return undefined;
      }

      const token = {
        type: "knowledgeNode",
        raw: match[0],
        knowledgeId: idMatch[1],
        knowledgeTitle: titleMatch[1],
        spaceId: spaceMatch ? spaceMatch[1] : undefined,
        dataSourceViewId: dsvMatch ? dsvMatch[1] : undefined,
      };

      return token;
    },
  },

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
      // Render selected knowledge as semantic HTML with full data preservation
      return [
        "span",
        mergeAttributes(
          {
            "data-type": "knowledge-node",
            "data-knowledge-id": selectedItems[0].id,
            "data-knowledge-label": selectedItems[0].label,
            "data-knowledge-description": selectedItems[0].description || "",
          },
          HTMLAttributes
        ),
        selectedItems[0].label,
      ];
    }

    // For search state, render as empty placeholder (shouldn't normally be serialized)
    return [
      "span",
      mergeAttributes(
        {
          "data-type": "knowledge-node",
          "data-is-searching": "true",
        },
        HTMLAttributes
      ),
      "[Knowledge search]",
    ];
  },

  renderMarkdown: (node: any) => {
    const { selectedItems } = node.attrs;
    if (selectedItems && selectedItems.length > 0) {
      const item = selectedItems[0];
      // Serialize essential data for model understanding and API fetching
      let apiParams = "";
      if (item.node?.dataSourceView) {
        const dsv = item.node.dataSourceView;
        const spaceId = dsv.spaceId || "";
        const dsvId = dsv.sId || "";
        apiParams = ` space="${spaceId}" dsv="${dsvId}"`;
      }
      return `<knowledge id="${item.id}" title="${item.label}"${apiParams} />`;
    }
    // Don't serialize search state - empty nodes shouldn't be saved
    return "";
  },

  parseMarkdown: (token, helpers) => {
    console.log("Parsing markdown token for KnowledgeNode:", token);

    // The custom tokenizer provides knowledgeId and knowledgeTitle directly
    if (token.knowledgeId && token.knowledgeTitle) {
      const selectedItem = {
        id: token.knowledgeId,
        label: token.knowledgeTitle,
        description: "", // No description needed for serialization
      };

      // Include API parameters for fetching full node data if available
      if (token.spaceId && token.dataSourceViewId) {
        selectedItem.spaceId = token.spaceId;
        selectedItem.dataSourceViewId = token.dataSourceViewId;
      }

      return {
        type: "knowledgeNode",
        attrs: {
          selectedItems: [selectedItem],
          isSearching: false,
        },
      };
    }

    return undefined;
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
