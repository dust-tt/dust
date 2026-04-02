import {
  INSTRUCTION_BLOCK_REGEX,
  OPENING_TAG_BEGINNING_REGEX,
} from "@app/lib/editor/instructionBlockUtils";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { MarkdownLexerConfiguration, MarkdownToken } from "@tiptap/core";
import { mergeAttributes, Node } from "@tiptap/core";

export const INSTRUCTIONS_ROOT_NODE_NAME = "instructionsRoot";

export interface InstructionBlockAttributes {
  type: string;
}

export const InstructionBlockBaseNode = Node.create<InstructionBlockAttributes>(
  {
    name: "instructionBlock",
    group: "block",
    priority: 1000,
    content: "block+",
    defining: true,
    isolating: true,
    selectable: true,

    addAttributes() {
      return {
        type: {
          default: "instructions",
          parseHTML: (element) =>
            element.getAttribute("data-instruction-type") ?? "instructions",
          renderHTML: (attributes) => ({
            "data-instruction-type": attributes.type,
          }),
        },
        isCollapsed: {
          default: false,
          parseHTML: (element) =>
            element.getAttribute("data-collapsed") === "true",
          renderHTML: (attributes) => ({
            "data-collapsed": attributes.isCollapsed,
          }),
        },
      };
    },

    parseHTML() {
      return [
        {
          tag: "div[data-type='instruction-block']",
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-type": "instruction-block",
        }),
        0,
      ];
    },

    markdownTokenizer: {
      name: "instructionBlock",
      level: "block",
      start: (src) => {
        const match = src.match(OPENING_TAG_BEGINNING_REGEX);
        return match?.index ?? -1;
      },
      tokenize: (
        src: string,
        _tokens: MarkdownToken[],
        lexer: MarkdownLexerConfiguration
      ) => {
        const match = src.match(INSTRUCTION_BLOCK_REGEX);
        if (!match) {
          return undefined;
        }

        const tagName = match[1] || "instructions";
        const content = match[2];

        let tokens;
        try {
          tokens = lexer.blockTokens(content);
        } catch (error) {
          try {
            tokens = lexer.blockTokens(content.trim());
            logger.warn("Marked lexer state corruption, passed with trim()", {
              error: normalizeError(error),
              sourceString: src,
              match2: content,
            });
          } catch (error) {
            logger.error(
              "Marked lexer state corruption, failed with trim(). Fallbacking...",
              {
                error: normalizeError(error),
                sourceString: src,
                match2: content.trim(),
              }
            );
            return undefined;
          }
        }

        return {
          type: "instructionBlock",
          raw: match[0],
          attrs: {
            type: tagName.toLowerCase(),
          },
          text: content,
          tokens,
        };
      },
    },

    parseMarkdown: (token, helpers) => {
      const tagType = token.attrs?.type ?? "instructions";
      const rawContent = helpers.parseChildren(token.tokens ?? []);

      const content = rawContent.flatMap((node) =>
        node.type === INSTRUCTIONS_ROOT_NODE_NAME
          ? (node.content ?? [])
          : [node]
      );

      return {
        type: "instructionBlock",
        attrs: {
          type: tagType,
          isCollapsed: false,
        },
        content: content.length > 0 ? content : [{ type: "paragraph" }],
      };
    },

    renderMarkdown: (node, helpers) => {
      const tagType = node.attrs?.type ?? "instructions";
      const children = node.content ?? [];

      const content = helpers.renderChildren(children, "\n\n");
      return `<${tagType}>\n\n${content}\n\n</${tagType}>`;
    },
  }
);
