import { ChevronDownIcon, ChevronRightIcon, Chip, cn } from "@dust-tt/sparkle";
import type { MarkdownLexerConfiguration, MarkdownToken } from "@tiptap/core";
import { InputRule } from "@tiptap/core";
import { mergeAttributes, Node } from "@tiptap/core";
import type { Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
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
const instructionBlockContentStyles = cn(
  "prose prose-sm",
  // Override for all headings to match the editor's heading style
  "[&_h1,&_h2,&_h3,&_h4,&_h5,&_h6]:text-xl",
  "[&_h1,&_h2,&_h3,&_h4,&_h5,&_h6]:font-semibold",
  "[&_h1,&_h2,&_h3,&_h4,&_h5,&_h6]:mt-4",
  "[&_h1,&_h2,&_h3,&_h4,&_h5,&_h6]:mb-3"
);

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

    addProseMirrorPlugins() {
      // Helper function to find first and last paragraph nodes in a block
      const findFirstLastParagraphs = (blockNode: ProseMirrorNode) => {
        let firstPara: ProseMirrorNode | null = null;
        let lastPara: ProseMirrorNode | null = null;
        let firstParaIndex = -1;
        let lastParaIndex = -1;

        for (let i = 0; i < blockNode.childCount; i++) {
          const child = blockNode.child(i);
          if (child.type.name === "paragraph") {
            if (firstPara === null) {
              firstPara = child;
              firstParaIndex = i;
            }
            lastPara = child;
            lastParaIndex = i;
          }
        }

        return { firstPara, lastPara, firstParaIndex, lastParaIndex };
      };

      // Helper function that returns tag name when paragraph is an exact tag line; otherwise null
      const getTagFromParagraph = (
        para: ProseMirrorNode | null,
        isClosing: boolean
      ) => {
        if (!para) {
          return null;
        }
        const text = para.textContent.trim();
        const regex = isClosing ? CLOSING_TAG_REGEX : OPENING_TAG_REGEX;
        const match = text.match(regex);
        if (!match) {
          return null;
        }
        const tag = match[1] || "";
        // Enforce exact-line match to avoid partial matches (e.g., prefixes)
        const expected = isClosing ? `</${tag}>` : `<${tag}>`;
        return text === expected ? tag : null;
      };

      return [
        // Plugin to style XML tags with chip appearance
        new Plugin({
          key: new PluginKey("instructionBlockTagDecoration"),
          props: {
            decorations(state) {
              const decorations: Decoration[] = [];

              state.doc.descendants((node, pos) => {
                if (node.type.name === "instructionBlock") {
                  // Use helper to find first and last paragraph tags
                  const { firstPara, lastPara, firstParaIndex, lastParaIndex } =
                    findFirstLastParagraphs(node);

                  if (!firstPara || !lastPara) {
                    return;
                  }

                  const openingTag = getTagFromParagraph(firstPara, false);
                  const closingTag = getTagFromParagraph(lastPara, true);

                  // Only decorate if both tags exist and match (case-insensitive)
                  if (
                    openingTag !== null &&
                    closingTag !== null &&
                    openingTag.toLowerCase() === closingTag.toLowerCase()
                  ) {
                    // Calculate positions
                    let firstPos = pos + 1;
                    for (let i = 0; i < firstParaIndex; i++) {
                      firstPos += node.child(i).nodeSize;
                    }

                    let lastPos = pos + 1;
                    for (let i = 0; i < lastParaIndex; i++) {
                      lastPos += node.child(i).nodeSize;
                    }

                    // Decorate opening tag
                    decorations.push(
                      Decoration.node(firstPos, firstPos + firstPara.nodeSize, {
                        class: `block w-fit px-1.5 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-xs font-medium uppercase mb-2`,
                      })
                    );
                    // Decorate closing tag
                    decorations.push(
                      Decoration.node(lastPos, lastPos + lastPara.nodeSize, {
                        class: `block w-fit px-1.5 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-xs font-medium uppercase mt-2`,
                      })
                    );
                  }
                }
              });

              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
        new Plugin({
          key: new PluginKey("instructionBlockTagSync"),
          appendTransaction: (transactions, oldState, newState) => {
            // Skip if this is already a sync transaction (prevent recursion)
            if (
              transactions.some((tr) => tr.getMeta("instructionBlockTagSync"))
            ) {
              return null;
            }

            // Only process if there were doc changes
            const hasDocChanged = transactions.some((tr) => tr.docChanged);
            if (!hasDocChanged) {
              return null;
            }

            const { selection } = newState;
            const $from = selection.$from;

            // Check if we're in an instruction block
            let blockDepth: number | null = null;
            let blockPos = -1;
            for (let d = $from.depth; d >= 0; d--) {
              if ($from.node(d).type.name === this.name) {
                blockDepth = d;
                blockPos = $from.before(d);
                break;
              }
            }

            if (blockDepth === null || blockPos === -1) {
              return null;
            }

            const blockNode = $from.node(blockDepth);
            const childIndex = $from.index(blockDepth);
            const currentNode = blockNode.child(childIndex);

            // Only proceed if we're editing a paragraph
            if (currentNode.type.name !== "paragraph") {
              return null;
            }

            // Use helper to find first and last paragraphs
            const { firstPara, lastPara, firstParaIndex, lastParaIndex } =
              findFirstLastParagraphs(blockNode);

            if (!firstPara || !lastPara || firstPara === lastPara) {
              return null; // Need at least two paragraphs for opening and closing tags
            }

            // Check if we're editing the opening or closing tag
            const isEditingOpeningTag = childIndex === firstParaIndex;
            const isEditingClosingTag = childIndex === lastParaIndex;

            if (!isEditingOpeningTag && !isEditingClosingTag) {
              return null; // Not editing a tag paragraph
            }

            // Get current tags
            const currentOpeningTag = getTagFromParagraph(firstPara, false);
            const currentClosingTag = getTagFromParagraph(lastPara, true);

            if (currentOpeningTag === null || currentClosingTag === null) {
              return null; // Not valid XML tags
            }

            // Check the old state to see if tags were previously in sync
            if (blockPos < 0 || blockPos >= oldState.doc.content.size) {
              return null; // Invalid position in old document
            }

            const oldBlockNode = oldState.doc.nodeAt(blockPos);
            if (!oldBlockNode) {
              return null;
            }

            // Get old tags using helper
            const oldTags = findFirstLastParagraphs(oldBlockNode);
            const oldOpeningTag = getTagFromParagraph(oldTags.firstPara, false);
            const oldClosingTag = getTagFromParagraph(oldTags.lastPara, true);

            if (oldOpeningTag === null || oldClosingTag === null) {
              return null; // Old state didn't have valid tags
            }

            // Only sync if tags were previously the same and now they're different
            if (oldOpeningTag !== oldClosingTag) {
              return null; // Tags weren't in sync before, don't auto-sync
            }

            // Check if we need to sync
            if (currentOpeningTag === currentClosingTag) {
              return null; // Already in sync
            }

            // Create transaction to sync the tags
            const tr = newState.tr;
            tr.setMeta("instructionBlockTagSync", true);
            tr.setMeta("addToHistory", false); // Don't add to undo history

            if (isEditingOpeningTag && currentOpeningTag !== oldOpeningTag) {
              // User changed opening tag, update closing tag to match
              const newClosingTag = currentOpeningTag
                ? `</${currentOpeningTag}>`
                : "</>";

              // Calculate position of last paragraph
              let pos = blockPos + 1;
              for (let i = 0; i < lastParaIndex; i++) {
                pos += blockNode.child(i).nodeSize;
              }

              tr.replaceWith(
                pos + 1,
                pos + lastPara.nodeSize - 1,
                newState.schema.text(newClosingTag)
              );

              return tr;
            }

            if (isEditingClosingTag && currentClosingTag !== oldClosingTag) {
              // User changed closing tag, update opening tag to match
              const newOpeningTag = currentClosingTag
                ? `<${currentClosingTag}>`
                : "<>";

              // Calculate position of first paragraph
              let pos = blockPos + 1;
              for (let i = 0; i < firstParaIndex; i++) {
                pos += blockNode.child(i).nodeSize;
              }

              tr.replaceWith(
                pos + 1,
                pos + firstPara.nodeSize - 1,
                newState.schema.text(newOpeningTag)
              );

              return tr;
            }

            return null;
          },
        }),
        new Plugin({
          key: new PluginKey("instructionBlockAutoConvert"),
          props: {
            clipboardTextSerializer: (slice: Slice) => {
              /**
               * Serializes the content of the text slice into a string format.
               * This is needed to handle copying the raw content of the XML
               * instruction blocks and paragraphs correctly.
               */
              const parts: string[] = [];
              for (let i = 0; i < slice.content.childCount; i++) {
                const child = slice.content.child(i);
                if (child.type.name === this.name) {
                  // Serialize instruction block content preserving markdown headings and code blocks
                  const innerParts: string[] = [];
                  child.forEach((node) => {
                    if (node.type.name === "heading") {
                      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                      const level = node.attrs?.level || 1;
                      const prefix = "#".repeat(level) + " ";
                      innerParts.push(prefix + node.textContent);
                    } else if (node.type.name === "codeBlock") {
                      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                      const language = node.attrs?.language || "";
                      const code = node.textContent;
                      innerParts.push(`\`\`\`${language}\n${code}\`\`\``);
                    } else if (node.type.name === "paragraph") {
                      innerParts.push(node.textContent);
                    } else {
                      innerParts.push(node.textContent);
                    }
                  });
                  parts.push(innerParts.join("\n"));
                } else if (child.type.name === "heading") {
                  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                  const level = child.attrs?.level || 1;
                  const prefix = "#".repeat(level) + " ";
                  parts.push(prefix + child.textContent);
                } else if (child.type.name === "codeBlock") {
                  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                  const language = child.attrs?.language || "";
                  const code = child.textContent;
                  parts.push(`\`\`\`${language}\n${code}\`\`\``);
                } else if (child.type.name === "paragraph") {
                  parts.push(child.textContent);
                } else if (child.isText) {
                  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                  parts.push(child.text || "");
                } else {
                  parts.push(child.textBetween(0, child.content.size, "\n"));
                }
                if (i < slice.content.childCount - 1) {
                  parts.push("\n");
                }
              }
              return parts.join("");
            },
          },
        }),
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
      const content = helpers.renderChildren(node.content ?? []);
      return `<${tagType}>${content}</${tagType}>`;
    },
  });
