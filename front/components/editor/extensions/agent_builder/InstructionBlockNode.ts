import {
  INSTRUCTION_BLOCK_REGEX,
  OPENING_TAG_BEGINNING_REGEX,
} from "@app/components/editor/extensions/agent_builder/instructionBlockUtils";
import { INSTRUCTIONS_ROOT_NODE_NAME } from "@app/components/editor/extensions/instructions/InstructionsRootExtension";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { MarkdownLexerConfiguration, MarkdownToken } from "@tiptap/core";
import { mergeAttributes, Node } from "@tiptap/core";

export interface InstructionBlockAttributes {
  type: string;
}

/**
 * The instruction block node, without its editor UI.
 *
 * An instruction block is a `<role>…</role>`-style section of an agent's instructions. This node
 * defines what the block is (its attributes, how it reads from and writes to HTML, and how it
 * reads from and writes to markdown). It has no node view, commands, input rules or plugins, so
 * it does not import React or sparkle and can be used on the server, e.g. to apply instruction
 * suggestions to an agent.
 *
 * The editor uses `InstructionBlockExtension`, which extends this node with the UI parts.
 */
export const InstructionBlockNode = Node.create<InstructionBlockAttributes>({
  name: "instructionBlock",
  group: "block",
  priority: 1000,
  content: "block+",
  defining: true,
  // Prevents auto-merging two blocks when they're not separated by a paragraph
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
      // Match opening tag, content, and closing tag
      const match = src.match(INSTRUCTION_BLOCK_REGEX);
      if (!match) {
        return undefined;
      }

      const tagName = match[1] || "instructions";
      const content = match[2];

      let tokens;
      try {
        // Attempt to tokenize nested content with original text in a try-catch
        // Sometimes we can't tokenize with non-breakable-space content, hence
        // the .trim() fallback
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
          // Marked lexer state corruption - fallback to treating as undefined, so we still at least display the content
          // but not the `<instructions>`
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

    // instructionsRoot: parseHTMLToken wraps malformed/unmatched tags via generateJSON(html,
    // baseExtensions). Since the schema is doc > instructionsRoot > block+, ProseMirror wraps
    // the fragment in instructionsRoot, which then appears as a child here. We unwrap it to
    // preserve its block children rather than dropping them.
    const content = rawContent.flatMap((node) =>
      node.type === INSTRUCTIONS_ROOT_NODE_NAME ? (node.content ?? []) : [node]
    );

    return {
      type: "instructionBlock",
      attrs: {
        type: tagType,
        isCollapsed: false,
      },
      // When tags contain only whitespace (e.g. "<foo>\n</foo>"), blockTokens("\n") produces
      // tokens that parseChildren can't convert to valid blocks, returning an empty array. This
      // violates the "block+" schema and crashes ProseMirror. Fall back to an empty paragraph.
      content: content.length > 0 ? content : [{ type: "paragraph" }],
    };
  },

  renderMarkdown: (node, helpers) => {
    const tagType = node.attrs?.type ?? "instructions";
    const children = node.content ?? [];

    // We use "\n\n" as a separator, because of a weird bug, see unit tests
    const content = helpers.renderChildren(children, "\n\n");
    return `<${tagType}>\n\n${content}\n\n</${tagType}>`;
  },
});
