import { ChevronDownIcon, ChevronRightIcon, Chip, cn } from "@dust-tt/sparkle";
import type { MarkdownLexerConfiguration, MarkdownToken } from "@tiptap/core";
import { InputRule } from "@tiptap/core";
import { mergeAttributes, Node } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import type { NodeViewProps } from "@tiptap/react";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import React, { useState } from "react";

import {
  CLOSING_TAG_REGEX,
  INSTRUCTION_BLOCK_REGEX,
  OPENING_TAG_BEGINNING_REGEX,
  OPENING_TAG_REGEX,
} from "@app/components/editor/extensions/agent_builder/instructionBlockUtils";

export interface InstructionBlockAttributes {
  type: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    instructionBlock: {
      insertInstructionBlock: () => ReturnType;
    };
  }
}

// Define consistent heading styles to match the main editor
const instructionBlockContentStyles = cn("prose prose-sm");

const InstructionBlockChip = ({ text }: { text: string }) => {
  return (
    <Chip
      size="mini"
      className="bg-gray-100 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
    >
      {text}
    </Chip>
  );
};

const InstructionBlockComponent: React.FC<NodeViewProps> = ({
  node,
  editor,
  getPos,
  selected,
  updateAttributes,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(
    node.attrs.isCollapsed ?? false
  );

  const displayType = node.attrs.type ? node.attrs.type.toUpperCase() : " ";

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);

    updateAttributes({ isCollapsed: newCollapsed });

    if (editor.isFocused) {
      editor.commands.focus();
    }
  };

  const ChevronIcon = isCollapsed ? ChevronRightIcon : ChevronDownIcon;

  const handleBlockClick = (e: React.MouseEvent) => {
    if (isCollapsed) {
      e.preventDefault();
      const pos = getPos();
      if (typeof pos === "number") {
        editor.commands.setNodeSelection(pos);
      }
    }
  };

  const containerClasses = `rounded-lg py-2 px-1 transition-all ${
    selected && isCollapsed
      ? "ring-2 ring-highlight-300 dark:ring-highlight-300-night"
      : ""
  }`;

  return (
    <NodeViewWrapper className="my-2">
      <div className={containerClasses} onClick={handleBlockClick}>
        <div className="flex items-start gap-1">
          <button
            onClick={handleToggle}
            className="mt-[3px] rounded p-0.5 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
            type="button"
            contentEditable={false}
          >
            <ChevronIcon className="h-4 w-4" />
          </button>
          {isCollapsed ? (
            <div
              contentEditable={false}
              className="mt-[0.5px] cursor-pointer"
              onClick={handleToggle}
            >
              <InstructionBlockChip text={`<${displayType}>`} />
            </div>
          ) : (
            <div className="mt-0.5 w-full">
              <InstructionBlockChip text={`<${displayType}>`} />
              <NodeViewContent
                className={instructionBlockContentStyles}
                as="div"
              />
              <InstructionBlockChip text={`</${displayType}>`} />
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export const InstructionBlockExtension =
  Node.create<InstructionBlockAttributes>({
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

    addCommands() {
      return {
        insertInstructionBlock:
          () =>
          ({ chain }) => {
            const content = {
              type: this.name,
              attrs: { type: "instructions", isCollapsed: false },
              content: [{ type: "paragraph" }],
            };

            return chain().focus().insertContent(content).run();
          },
      };
    },

    addNodeView() {
      return ReactNodeViewRenderer(InstructionBlockComponent);
    },

    addInputRules() {
      return [
        new InputRule({
          find: OPENING_TAG_REGEX,
          handler: ({ range, match, chain }) => {
            const type = match[1] ? match[1].toLowerCase() : "";
            const tagType = type || "instructions";

            if (this.editor.isActive(this.name)) {
              return;
            }

            const content = {
              type: this.name,
              attrs: { type: tagType, isCollapsed: false },
              content: [{ type: "paragraph" }],
            };

            chain()
              .focus()
              .deleteRange({ from: range.from, to: range.to })
              .insertContent(content)
              .run();
          },
        }),
      ];
    },

    addKeyboardShortcuts() {
      return {
        /**
         * Handles Shift+Enter to split the block without creating a new paragraph.
         * This allows users to create a new line within the instruction block.
         */
        "Shift-Enter": () => {
          if (!this.editor.isActive(this.name)) {
            return false;
          }
          return this.editor.commands.splitBlock();
        },
        /**
         * Handles backspace key to remove empty instruction blocks.
         */
        Backspace: () => {
          if (!this.editor.isActive(this.name)) {
            return false;
          }

          const { state } = this.editor;
          const { selection } = state;
          const $from = selection.$from;

          if (!selection.empty) {
            return false;
          }

          // Only act if cursor is at the start of a paragraph
          if ($from.parentOffset !== 0) {
            return false;
          }

          let blockDepth: number | null = null;
          for (let d = $from.depth; d >= 0; d -= 1) {
            if ($from.node(d).type.name === this.name) {
              blockDepth = d;
              break;
            }
          }

          if (blockDepth === null) {
            return false;
          }

          const blockNode = $from.node(blockDepth);
          const childIndex = $from.index(blockDepth);

          // If we're not in the first paragraph, let default backspace behavior handle it
          // (this will merge with the previous paragraph)
          if (childIndex > 0) {
            return false;
          }

          // We're in the first paragraph and at its start
          // Only delete the block if it's completely empty
          const isBlockEmpty = blockNode.textContent.trim().length === 0;

          if (!isBlockEmpty) {
            return false;
          }

          // Additional check: only delete if block has minimal structure (3 paragraphs)
          // This prevents deletion when there are multiple empty lines
          if (blockNode.childCount > 3) {
            return false;
          }

          const tr = state.tr;
          const fromPos = $from.before(blockDepth);
          const toPos = fromPos + blockNode.nodeSize;

          tr.delete(fromPos, toPos);

          // Place caret at end of previous paragraph if present; otherwise create one
          const $before = tr.doc.resolve(fromPos);
          const prev = $before.nodeBefore;
          if (prev && prev.type.name === "paragraph") {
            tr.setSelection(TextSelection.create(tr.doc, fromPos - 1));
          } else {
            tr.insert(fromPos, state.schema.nodes.paragraph.create());
            tr.setSelection(TextSelection.create(tr.doc, fromPos + 1));
          }

          this.editor.view.dispatch(tr);
          this.editor.commands.focus();
          return true;
        },
        /**
         * Handles Enter to exit the block when on the last empty line
         */
        Enter: () => {
          if (!this.editor.isActive(this.name)) {
            return false;
          }

          const { state } = this.editor;
          const { selection } = state;
          const $from = selection.$from;

          if (!selection.empty) {
            return false;
          }

          let blockDepth: number | null = null;
          for (let d = $from.depth; d >= 0; d -= 1) {
            if ($from.node(d).type.name === this.name) {
              blockDepth = d;
              break;
            }
          }

          if (blockDepth === null) {
            return false;
          }

          const blockNode = $from.node(blockDepth);
          const childIndex = $from.index(blockDepth);

          // Check if we're in the last paragraph of the block
          const isInLastChild = childIndex === blockNode.childCount - 1;

          if (!isInLastChild) {
            // Let default behavior handle non-last lines
            return false;
          }

          // Check if current paragraph is the closing tag or empty
          const paragraphNode = $from.node(blockDepth + 1);
          const isParagraphEmpty =
            paragraphNode &&
            paragraphNode.type.name === "paragraph" &&
            paragraphNode.textContent.trim().length === 0;

          // Check if cursor is at the end of closing tag (including empty tags)
          const isAtEndOfClosingTag =
            paragraphNode &&
            paragraphNode.type.name === "paragraph" &&
            paragraphNode.textContent.match(CLOSING_TAG_REGEX) &&
            $from.parentOffset === paragraphNode.content.size;

          if (!isParagraphEmpty && !isAtEndOfClosingTag) {
            // Let default behavior handle other cases
            return false;
          }

          // Exit the block by creating a new paragraph after it
          const tr = state.tr;
          const posBeforeBlock = $from.before(blockDepth);
          const posAfterBlock = posBeforeBlock + blockNode.nodeSize;

          const $after = tr.doc.resolve(posAfterBlock);
          const nextNode = $after.nodeAfter;
          if (!nextNode || nextNode.type.name !== "paragraph") {
            tr.insert(posAfterBlock, state.schema.nodes.paragraph.create());
          }
          tr.setSelection(TextSelection.create(tr.doc, posAfterBlock + 1));

          this.editor.view.dispatch(tr);
          this.editor.commands.focus();
          return true;
        },
      };
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

        return {
          type: "instructionBlock",
          raw: match[0],
          attrs: {
            type: tagName.toLowerCase(),
          },
          text: match[2],
          tokens: lexer.blockTokens(match[2]),
        };
      },
    },

    parseMarkdown: (token, helpers) => {
      const tagType = token.attrs?.type ?? "instructions";

      return {
        type: "instructionBlock",
        attrs: {
          type: tagType,
          isCollapsed: false,
        },
        // The content markdown will be parsed by the markdown parser
        content: helpers.parseChildren(token.tokens ?? []),
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
