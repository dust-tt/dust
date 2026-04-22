import type {
  BaseKnowledgeItem,
  KnowledgeItem,
} from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";
import {
  computeHasChildren,
  isFullKnowledgeItem,
  KnowledgeNodeView,
} from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";
import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export interface KnowledgeNodeAttributes {
  selectedItems: KnowledgeItem[];
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    knowledgeNode: {
      insertKnowledgeNode: () => ReturnType;
    };
  }
}

export const KNOWLEDGE_NODE_TYPE = "knowledgeNode";

const KNOWLEDGE_TAG = "knowledge";
export const KNOWLEDGE_TAG_REGEX = new RegExp(
  `^<${KNOWLEDGE_TAG}\\s+([^>]+)\\s*/>`
);

export const KnowledgeNode = Node.create<{}>({
  name: KNOWLEDGE_NODE_TYPE,

  group: "inline",
  inline: true,
  atom: false, // Make it editable.
  selectable: false, // Allow text cursor inside.

  markdownTokenizer: {
    name: "knowledgeNode",
    level: "inline",
    start: (src) => {
      return src.indexOf(`<${KNOWLEDGE_TAG}`);
    },
    tokenize: (src) => {
      const match = KNOWLEDGE_TAG_REGEX.exec(src);
      if (!match) {
        return undefined;
      }

      const attributesString = match[1];
      const dsvMatch = attributesString.match(/dsv="([^"]*)"/);
      const hasChildrenMatch = attributesString.match(/hasChildren="([^"]*)"/);
      const idMatch = attributesString.match(/id="([^"]+)"/);
      const spaceMatch = attributesString.match(/space="([^"]*)"/);
      const titleMatch = attributesString.match(/title="([^"]+)"/);

      if (!idMatch || !titleMatch) {
        return undefined;
      }

      const token = {
        type: "knowledgeNode",
        dataSourceViewId: dsvMatch ? dsvMatch[1] : undefined,
        hasChildren: hasChildrenMatch ? hasChildrenMatch[1] === "true" : false,
        knowledgeId: idMatch[1],
        knowledgeTitle: titleMatch[1],
        raw: match[0],
        spaceId: spaceMatch ? spaceMatch[1] : undefined,
      };

      return token;
    },
  },

  addAttributes() {
    return {
      selectedItems: {
        default: [],
        parseHTML: (element) => {
          if (element.tagName.toLowerCase() === KNOWLEDGE_TAG) {
            const id = element.getAttribute("id");
            const title = element.getAttribute("title");
            if (id && title) {
              const item: BaseKnowledgeItem = {
                dataSourceViewId: element.getAttribute("dsv") ?? "",
                hasChildren: element.getAttribute("hasChildren") === "true",
                label: title,
                nodeId: id,
                spaceId: element.getAttribute("space") ?? "",
              };
              return [item];
            }
          }

          // Maintaing for backwards compatibility with old serialized data.
          // Previously, the renderHTML output was a span with data-selected-items.
          // But now we use the <knowledge> tag for all serialization.
          const data = element.getAttribute("data-selected-items");
          if (data) {
            return JSON.parse(decodeURIComponent(data));
          }

          return [];
        },
        renderHTML: (attributes) => {
          // TipTap passes attribute values loosely typed.
          // We only serialize one <knowledge> element, so map the first selected item to
          // DOM attrs.
          const item = (attributes.selectedItems as KnowledgeItem[])[0];
          if (!item) {
            return {};
          }
          const hasChildren = isFullKnowledgeItem(item)
            ? computeHasChildren(item.node)
            : item.hasChildren;
          return {
            id: item.nodeId,
            title: item.label,
            space: item.spaceId,
            dsv: item.dataSourceViewId,
            hasChildren: String(hasChildren),
          };
        },
      },
    };
  },

  // HTML serialization and deserialization.

  parseHTML() {
    return [
      // Maintaining for backwards compatibility with old serialized data.
      // Previously, renderHTML output was a span with data-type="knowledge-node".
      // But now we use the <knowledge> tag for all serialization.
      {
        tag: 'span[data-type="knowledge-node"]',
      },
      {
        tag: KNOWLEDGE_TAG,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { selectedItems } = node.attrs;

    if (selectedItems.length > 0) {
      return [KNOWLEDGE_TAG, HTMLAttributes];
    }

    // Search state is transient UI — nothing to serialize.
    return ["span", {}];
  },

  // Markdown serialization and deserialization.
  //
  // IMPORTANT: The serialization format (especially hasChildren) is designed to match
  // the output of renderNode() in lib/actions/mcp_internal_actions/rendering.ts.
  // This ensures agents see consistent data structure between:
  // - Knowledge attached in instructions (serialized here)
  // - Tool outputs from data_sources_file_system server (rendered by renderNode)
  // If you change this format, review renderNode() and vice versa.

  renderMarkdown: (node) => {
    if (
      node.attrs &&
      "selectedItems" in node.attrs &&
      node.attrs.selectedItems &&
      node.attrs.selectedItems.length > 0
    ) {
      const [item] = node.attrs.selectedItems as KnowledgeItem[];

      // Compute hasChildren with special logic for Notion if we have full node data.
      const hasChildren = isFullKnowledgeItem(item)
        ? computeHasChildren(item.node)
        : item.hasChildren;

      // Serialize essential data for model understanding and API fetching.
      // Format kept aligned with renderNode() output for consistency.
      return `<${KNOWLEDGE_TAG} id="${item.nodeId}" title="${item.label}" space="${item.spaceId}" dsv="${item.dataSourceViewId}" hasChildren="${hasChildren}" />`;
    }

    // Don't serialize search state, empty nodes shouldn't be saved.
    return "";
  },

  parseMarkdown: (token) => {
    const selectedItem: BaseKnowledgeItem = {
      dataSourceViewId: token.dataSourceViewId,
      hasChildren: token.hasChildren,
      label: token.knowledgeTitle,
      nodeId: token.knowledgeId,
      spaceId: token.spaceId,
    };

    return {
      type: "knowledgeNode",
      attrs: {
        selectedItems: [selectedItem],
      },
    };
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
