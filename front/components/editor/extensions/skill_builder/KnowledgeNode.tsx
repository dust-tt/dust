import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import type {
  BaseKnowledgeItem,
  KnowledgeItem,
} from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";
import {
  computeHasChildren,
  isFullKnowledgeItem,
  KnowledgeNodeView,
} from "@app/components/editor/extensions/skill_builder/KnowledgeNodeView";

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

// The markdown tag name used for serialization: <knowledge id="..." title="..." />.
// This format is intentionally HTML-like for LLM readability.
const KNOWLEDGE_MARKDOWN_TAG = "knowledge";

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
      return src.indexOf(`<${KNOWLEDGE_MARKDOWN_TAG}`);
    },
    tokenize: (src) => {
      const match = new RegExp(
        `^<${KNOWLEDGE_MARKDOWN_TAG}\\s+([^>]+)\\s*/>`
      ).exec(src);
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
          // Primary path: deserialization from renderHTML (span with JSON data).
          const data = element.getAttribute("data-selected-items");
          if (data) {
            return JSON.parse(data);
          }

          // Fallback path: deserialization from a <knowledge> HTML element.
          //
          // This handles a markdown round-trip edge case: when a knowledge node
          // is alone on its own line, marked.js treats the <knowledge .../> tag
          // as block-level HTML (instead of routing it through our inline
          // markdownTokenizer). The tag then goes through TipTap's parseHTML
          // pipeline, so we need to extract the attributes here.
          if (element.tagName.toLowerCase() === KNOWLEDGE_MARKDOWN_TAG) {
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

          return [];
        },
        renderHTML: (attributes) => ({
          "data-selected-items": JSON.stringify(attributes.selectedItems),
        }),
      },
    };
  },

  // HTML serialization and deserialization.

  parseHTML() {
    return [
      {
        tag: 'span[data-type="knowledge-node"]',
      },
      // Fallback: match <knowledge> tags that marked.js parsed as block HTML.
      // See the comment in addAttributes().parseHTML for details.
      {
        tag: KNOWLEDGE_MARKDOWN_TAG,
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
            "data-knowledge-description": selectedItems[0].description ?? "",
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
      return `<${KNOWLEDGE_MARKDOWN_TAG} id="${item.nodeId}" title="${item.label}" space="${item.spaceId}" dsv="${item.dataSourceViewId}" hasChildren="${hasChildren}" />`;
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
