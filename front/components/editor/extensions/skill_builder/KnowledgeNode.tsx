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
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type React from "react";

export interface KnowledgeNodeAttributes {
  selectedItems: KnowledgeItem[];
}

const KNOWLEDGE_CHIP_CLASS =
  "inline-flex items-center gap-0.5 border border-current/40 rounded px-0.5 text-xs leading-tight";
// We use this instead of Sparkle's DocumentIcon because renderHTML returns a plain DOMOutputSpec which cannot
// contain React components, and ProseMirror's renderSpec doesn't support SVG
// namespace elements. Using the emoji in both paths keeps additions and deletions
// visually consistent in the suggestion diff view.
const DOCUMENT_ICON = "📄";

const KnowledgeNodeReadOnlyView: React.FC<NodeViewProps> = ({ node }) => {
  const { selectedItems } = node.attrs;
  const item = selectedItems[0] as KnowledgeItem | undefined;
  if (!item) {
    return null;
  }
  // No background or explicit color so diff decorations act on the content directly
  return (
    <NodeViewWrapper as="span" className={KNOWLEDGE_CHIP_CLASS}>
      <span>{DOCUMENT_ICON}</span>
      <span>{` ${item.label}`}</span>
    </NodeViewWrapper>
  );
};

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

export interface KnowledgeNodeOptions {
  readOnly: boolean;
}

export const KnowledgeNode = Node.create<KnowledgeNodeOptions>({
  addOptions() {
    return { readOnly: false };
  },
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
      const label = selectedItems[0].label;
      return [
        "knowledge",
        HTMLAttributes,
        [
          "span",
          { class: KNOWLEDGE_CHIP_CLASS },
          ["span", {}, DOCUMENT_ICON],
          ["span", {}, ` ${label}`],
        ],
      ];
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
    return ReactNodeViewRenderer(
      this.options.readOnly ? KnowledgeNodeReadOnlyView : KnowledgeNodeView
    );
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
