import type { ToolNodeAttributes } from "@app/components/editor/extensions/skill_builder/ToolNodeTypes";
import {
  parseToolTag,
  serializeToolTag,
  TOOL_TAG_NAME,
  TOOL_TAG_REGEX_BEGINNING,
} from "@app/lib/tools/format";
import { isString } from "@app/types/shared/utils/general";
import { Node } from "@tiptap/core";

export const TOOL_NODE_TYPE = "toolNode";

const TOOL_CHIP_CLASS =
  "inline-flex items-center gap-0.5 border border-current/40 rounded px-0.5 text-xs leading-tight";
const TOOL_LABEL_PREFIX = "Tool";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    toolNode: {
      insertToolNode: (attrs: ToolNodeAttributes) => ReturnType;
    };
  }
}

export const ToolNode = Node.create({
  name: TOOL_NODE_TYPE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      mcpServerViewId: {
        default: null,
        parseHTML: (element) => element.getAttribute("id"),
        renderHTML: (attributes) =>
          isString(attributes.mcpServerViewId)
            ? { id: attributes.mcpServerViewId }
            : {},
      },
      toolName: {
        default: null,
        parseHTML: (element) => element.getAttribute("name"),
        renderHTML: (attributes) =>
          isString(attributes.toolName) ? { name: attributes.toolName } : {},
      },
      toolIcon: {
        default: null,
        parseHTML: (element) => element.getAttribute("icon"),
        renderHTML: (attributes) =>
          isString(attributes.toolIcon) ? { icon: attributes.toolIcon } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: TOOL_TAG_NAME,
        getAttrs: (node) => {
          if (!(node instanceof HTMLElement)) {
            return false;
          }

          return node.getAttribute("id") && node.getAttribute("name")
            ? null
            : false;
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { toolName } = node.attrs;
    if (!isString(toolName)) {
      return ["span", {}];
    }

    return [
      TOOL_TAG_NAME,
      HTMLAttributes,
      [
        "span",
        { class: TOOL_CHIP_CLASS },
        ["span", {}, TOOL_LABEL_PREFIX],
        ["span", {}, ` ${toolName}`],
      ],
    ];
  },

  renderText({ node }) {
    return `/${node.attrs.toolName ?? "tool"}`;
  },

  addCommands() {
    return {
      insertToolNode:
        (attrs: ToolNodeAttributes) =>
        ({ commands }) =>
          commands.insertContent([
            {
              type: TOOL_NODE_TYPE,
              attrs,
            },
            { type: "text", text: " " },
          ]),
    };
  },

  markdownTokenizer: {
    name: TOOL_NODE_TYPE,
    level: "inline",
    start: (src) => src.indexOf(`<${TOOL_TAG_NAME}`),
    tokenize: (src) => {
      const match = TOOL_TAG_REGEX_BEGINNING.exec(src);
      if (!match) {
        return undefined;
      }

      const tool = parseToolTag(match[0]);
      if (!tool) {
        return undefined;
      }

      return {
        type: TOOL_NODE_TYPE,
        raw: match[0],
        mcpServerViewId: tool.id,
        toolIcon: tool.icon,
        toolName: tool.name,
      };
    },
  },

  parseMarkdown: (token) => ({
    type: TOOL_NODE_TYPE,
    attrs: {
      mcpServerViewId: token.mcpServerViewId,
      toolIcon: token.toolIcon,
      toolName: token.toolName,
    },
  }),

  renderMarkdown: (node) =>
    isString(node.attrs?.mcpServerViewId) && isString(node.attrs?.toolName)
      ? serializeToolTag({
          icon: isString(node.attrs.toolIcon) ? node.attrs.toolIcon : null,
          id: node.attrs.mcpServerViewId,
          name: node.attrs.toolName,
        })
      : "",
});
