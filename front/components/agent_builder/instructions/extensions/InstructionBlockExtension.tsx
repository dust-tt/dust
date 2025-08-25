import { ChevronDownIcon, ChevronRightIcon, Chip } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/core";
import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import type { Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";
import type { NodeViewProps } from "@tiptap/react";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import React, { useState } from "react";

import { OPENING_TAG_REGEX } from "@app/lib/client/agent_builder/instructionBlockUtils";

export interface InstructionBlockAttributes {
  type: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    instructionBlock: {
      setInstructionBlock: (
        attributes: InstructionBlockAttributes
      ) => ReturnType;
      insertInstructionBlock: (type: string) => ReturnType;
    };
  }
}

/**
 * Position cursor in the empty paragraph between XML tags
 */
function positionCursorInMiddleParagraph(
  editor: Editor,
  blockPos: number
): boolean {
  const node = editor.state.doc.nodeAt(blockPos);

  if (!node || node.type.name !== "instructionBlock") {
    logger.warn(
      "Invalid node: not an instruction block at position",
      blockPos
    );
      "Invalid node: not an instruction block at position",
      blockPos
    );
    return false;
  }

  if (node.childCount < 3) {
    console.warn(
      "Invalid instruction block structure: expected at least 3 children, got",
      node.childCount
    );
    return false;
  }

  const firstPara = node.child(0);
  const firstParaSize = firstPara.nodeSize;

  // Position inside the middle paragraph (not just between nodes)
  const targetPos = blockPos + 1 + firstParaSize + 1;

  editor.commands.setTextSelection(targetPos);
  editor.commands.focus();

  return true;
}

const InstructionBlockComponent: React.FC<NodeViewProps> = ({
  node,
  editor,
  getPos,
  selected,
  updateAttributes,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(
    node.attrs.isCollapsed || false
  );

  // Derive display type directly from content
  // Empty tags should show as truly empty (no chip)
  let displayType = "";

  // Only check the first paragraph for the tag
  if (node.childCount > 0) {
    const firstChild = node.child(0);
    if (firstChild.type.name === "paragraph") {
      const text = firstChild.textContent.trim();
      // Match opening tag pattern: <tagname> or empty <>
      const match = text.match(/^<(\w*)>$/);
      if (match) {
        displayType = match[1] || ""; // Empty string for <>
      }
    }
  }

  // No fallback - if tag is empty, keep display empty
  // This gives users clear feedback that the tag is empty

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);

    // Update the node attribute so ProseMirror knows about the state
    updateAttributes({ isCollapsed: newCollapsed });

    // Just maintain editor focus if it was already focused
    // Don't change selection or cursor position
    if (editor.isFocused) {
      editor.commands.focus();
    }
  };

  const ChevronIcon = isCollapsed ? ChevronRightIcon : ChevronDownIcon;

  // Handle click on collapsed block to select it
  const handleBlockClick = (e: React.MouseEvent) => {
    if (isCollapsed) {
      e.preventDefault();
      const pos = getPos();
      if (typeof pos === "number") {
        // Select the entire node
        editor.commands.setNodeSelection(pos);
      }
    }
  };

  // Show selection ring when collapsed and selected
  const containerClasses = `rounded-lg border bg-gray-100 p-2 dark:bg-gray-800 transition-all ${
    selected && isCollapsed
      ? "ring-2 ring-highlight-300 dark:ring-highlight-300-night border-highlight-300 dark:border-highlight-300-night"
      : "border-border"
  }`;

  return (
    <NodeViewWrapper className="my-2">
      <div className={containerClasses} onClick={handleBlockClick}>
        <div
          className="flex select-none items-center gap-1"
          contentEditable={false}
        >
          <button
            onClick={handleToggle}
            className="rounded p-0.5 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
            type="button"
          >
            <ChevronIcon className="h-4 w-4" />
          </button>
          <Chip size="mini">{displayType.toUpperCase() || " "}</Chip>
        </div>
        {!isCollapsed && (
          <NodeViewContent className="prose prose-sm mt-2 font-mono" as="div" />
        )}
      </div>
    </NodeViewWrapper>
  );
};

export const InstructionBlockExtension =
  Node.create<InstructionBlockAttributes>({
    name: "instructionBlock",
    group: "block",
    priority: 1000,
    content: "paragraph+",
    defining: true,
    /** Prevents auto-merging two blocks when they're not separated by a paragraph */
    isolating: true,
    selectable: true,

    addAttributes() {
      return {
        type: {
          default: "instructions",
          parseHTML: (element) =>
            element.getAttribute("data-instruction-type") || "instructions",
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
        setInstructionBlock:
          (attributes) =>
          ({ commands }) =>
            commands.setNode(this.name, attributes),

        insertInstructionBlock:
          (type) =>
          ({ commands, editor }) => {
            const success = commands.insertContent({
              type: this.name,
              attrs: { type },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: `<${type}>` }],
                },
                { type: "paragraph" },
                {
                  type: "paragraph",
                  content: [{ type: "text", text: `</${type}>` }],
                },
              ],
            });

            if (success) {
              requestAnimationFrame(() => {
                // Safety check: ensure editor is still valid
                if (editor.isDestroyed || !editor.view) {
                  return;
                }

                const { selection } = editor.state;
                const $from = selection.$from;

                // Walk up from current position to find enclosing instruction block
                let blockPos = -1;
                for (let d = $from.depth; d >= 0; d--) {
                  const node = $from.node(d);
                  if (node.type.name === this.name) {
                    blockPos = $from.before(d);
                    break;
                  }
                }

                if (blockPos > -1) {
                  positionCursorInMiddleParagraph(editor, blockPos);
                }
              });
            }

            return success;
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
          handler: ({ range, match, commands }) => {
            const type = match[1] ? match[1].toLowerCase() : "";

            if (this.editor.isActive(this.name)) {
              return;
            }

            const tagType = type || "instructions";

            commands.insertContentAt(
              { from: range.from, to: range.to },
              {
                type: this.name,
                attrs: { type: tagType },
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: `<${tagType}>` }],
                  },
                  { type: "paragraph" },
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: `</${tagType}>` }],
                  },
                ],
              }
            );

            requestAnimationFrame(() => {
              // Safety check: ensure editor is still valid
              if (this.editor.isDestroyed || !this.editor.view) {
                return;
              }

              const { selection } = this.editor.state;
              const $from = selection.$from;

              // Walk up from current position to find enclosing instruction block
              let blockPos = -1;
              for (let d = $from.depth; d >= 0; d--) {
                const node = $from.node(d);
                if (node.type.name === this.name) {
                  blockPos = $from.before(d);
                  break;
                }
              }

              if (blockPos > -1) {
                positionCursorInMiddleParagraph(this.editor, blockPos);
              }
            });
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

          // Only act on caret selections
          if (!selection.empty) {
            return false;
          }

          // Only act if cursor is at the start of a paragraph
          if ($from.parentOffset !== 0) {
            return false;
          }

          // Find enclosing instruction block depth
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

          // Remove the empty block
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

          // Find enclosing instruction block depth
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
            paragraphNode.textContent.match(/^<\/(\w*)>$/) &&
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
      return [
        // Plugin for syncing tags
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

            let tr = null;
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

            // Check if we're editing the first or last paragraph (opening/closing tag)
            const childIndex = $from.index(blockDepth);
            const isEditingOpeningTag = childIndex === 0;
            const isEditingClosingTag = childIndex === blockNode.childCount - 1;

            if (!isEditingOpeningTag && !isEditingClosingTag) {
              return null;
            }
            if (blockNode.childCount < 2) {
              // Need at least opening and closing tags
              return null;
            }

            // Get the opening and closing tag paragraphs
            const firstPara = blockNode.child(0);
            const lastPara = blockNode.child(blockNode.childCount - 1);

            // Extract tag names
            const openingText = firstPara.textContent.trim();
            const closingText = lastPara.textContent.trim();

            // Parse opening and closing tags
            const openingMatch = openingText.match(/^<(\w*)>$/);
            const closingMatch = closingText.match(/^<\/(\w*)>$/);

            // Both tags must be valid for syncing
            if (!openingMatch || !closingMatch) {
              return null;
            }

            const currentOpeningTag = openingMatch[1] || "";
            const currentClosingTag = closingMatch[1] || "";

            // Check if we need to sync (only if they were different)
            // We need to check the old state to see if they matched before
            const oldDoc = oldState.doc;

            // Safety check: ensure blockPos is within the old document bounds
            if (blockPos < 0 || blockPos >= oldDoc.content.size) {
              return null; // Skip syncing if position is invalid in old document
            }

            const oldBlockNode = oldDoc.nodeAt(blockPos);

            if (oldBlockNode && oldBlockNode.childCount >= 2) {
              const oldFirstPara = oldBlockNode.child(0);
              const oldLastPara = oldBlockNode.child(
                oldBlockNode.childCount - 1
              );

              const oldOpeningText = oldFirstPara.textContent.trim();
              const oldClosingText = oldLastPara.textContent.trim();

              const oldOpeningMatch = oldOpeningText.match(/^<(\w*)>$/);
              const oldClosingMatch = oldClosingText.match(/^<\/(\w*)>$/);

              if (oldOpeningMatch && oldClosingMatch) {
                const oldOpeningTag = oldOpeningMatch[1] || "";
                const oldClosingTag = oldClosingMatch[1] || "";

                // Sync opening -> closing when editing opening tag
                if (
                  isEditingOpeningTag &&
                  oldOpeningTag === oldClosingTag &&
                  currentOpeningTag !== oldOpeningTag &&
                  currentClosingTag === oldClosingTag
                ) {
                  if (!tr) {
                    tr = newState.tr;
                    tr.setMeta("instructionBlockTagSync", true);
                    // Keep undo history clean
                    tr.setMeta("addToHistory", false);
                  }

                  // Calculate position of last paragraph
                  let lastParaPos = blockPos + 1;
                  for (let i = 0; i < blockNode.childCount - 1; i++) {
                    lastParaPos += blockNode.child(i).nodeSize;
                  }

                  // Update closing tag
                  const newClosingTag = currentOpeningTag
                    ? `</${currentOpeningTag}>`
                    : "</>";
                  tr.replaceWith(
                    lastParaPos + 1,
                    lastParaPos + lastPara.nodeSize - 1,
                    newState.schema.text(newClosingTag)
                  );

                  return tr;
                }

                // Sync closing -> opening when editing closing tag
                if (
                  isEditingClosingTag &&
                  oldOpeningTag === oldClosingTag &&
                  currentOpeningTag === oldOpeningTag &&
                  currentClosingTag !== oldClosingTag
                ) {
                  if (!tr) {
                    tr = newState.tr;
                    tr.setMeta("instructionBlockTagSync", true);
                    // Keep undo history clean
                    tr.setMeta("addToHistory", false);
                  }

                  // Update opening tag (fix: correct range inside paragraph)
                  const newOpeningTag = currentClosingTag
                    ? `<${currentClosingTag}>`
                    : "<>";
                  const firstParaStart = blockPos + 1;
                  tr.replaceWith(
                    firstParaStart + 1, // Start of text inside paragraph
                    firstParaStart + firstPara.nodeSize - 1, // End of paragraph content
                    newState.schema.text(newOpeningTag)
                  );

                  return tr;
                }
              }
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
                  // Just get the text content as-is since tags are now part of the content
                  const inner = child.textBetween(0, child.content.size, "\n");
                  parts.push(inner);
                } else if (child.type.name === "paragraph") {
                  parts.push(child.textContent);
                } else if (child.isText) {
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
  });
