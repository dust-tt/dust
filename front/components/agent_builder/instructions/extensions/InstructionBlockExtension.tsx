import { Chip } from "@dust-tt/sparkle";
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
import React from "react";

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
function positionCursorInMiddleParagraph(editor: Editor, blockPos: number): boolean {
  const node = editor.state.doc.nodeAt(blockPos);
  
  if (!node || node.type.name !== 'instructionBlock') {
    console.warn('Invalid node: not an instruction block at position', blockPos);
    return false;
  }
  
  if (node.childCount < 3) {
    console.warn('Invalid instruction block structure: expected at least 3 children, got', node.childCount);
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
}) => {
  const { type } = node.attrs as InstructionBlockAttributes;

  return (
    <NodeViewWrapper className="my-2">
      <div className="rounded-lg border border-border bg-gray-100 p-2 dark:bg-gray-800">
        <div className="mb-2">
          <Chip size="mini">{type.toUpperCase()}</Chip>
        </div>
        <NodeViewContent 
          className="prose prose-sm" 
          as="div"
        />
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
                  content: [{ type: "text", text: `<${type}>` }]
                },
                { type: "paragraph" },
                { 
                  type: "paragraph", 
                  content: [{ type: "text", text: `</${type}>` }]
                }
              ],
            });

            if (success) {
              requestAnimationFrame(() => {
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
                    content: [{ type: "text", text: `<${tagType}>` }]
                  },
                  { type: "paragraph" },
                  { 
                    type: "paragraph", 
                    content: [{ type: "text", text: `</${tagType}>` }]
                  }
                ],
              }
            );
            
            requestAnimationFrame(() => {
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

          // Check if current paragraph is empty
          const paragraphNode = $from.node(blockDepth + 1);
          const isParagraphEmpty =
            paragraphNode &&
            paragraphNode.type.name === "paragraph" &&
            paragraphNode.textContent.trim().length === 0;

          if (!isParagraphEmpty) {
            // Let default behavior handle non-empty lines
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
        /**
         * Handles ArrowDown key to navigate to the next paragraph after the instruction block.
         */
        ArrowDown: () => {
          if (!this.editor.isActive(this.name)) {
            return false;
          }

          const { state } = this.editor;
          const { doc, selection } = state;
          const $from = selection.$from;

          // Find the depth of the surrounding instruction block
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

          // Only trigger when at the end of the last paragraph in the block
          const isAtEndOfTextBlock =
            selection.empty && $from.parentOffset === $from.parent.content.size;
          const isInLastChild = childIndex === blockNode.childCount - 1;

          if (!isAtEndOfTextBlock || !isInLastChild) {
            return false;
          }

          const posBeforeBlock = $from.before(blockDepth);
          const posAfterBlock = posBeforeBlock + blockNode.nodeSize;
          const $after = doc.resolve(posAfterBlock);
          const nextNode = $after.nodeAfter;

          if (!nextNode || nextNode.type.name !== "paragraph") {
            // Create a paragraph after the block if none exists
            this.editor.commands.insertContentAt(posAfterBlock, {
              type: "paragraph",
            });
          }

          // Place the cursor at the start of the paragraph after the block
          this.editor.commands.setTextSelection(posAfterBlock + 1);
          this.editor.commands.focus();
          return true;
        },
        /**
         * Handles ArrowUp key to navigate to the previous paragraph before the instruction block.
         */
        ArrowUp: () => {
          if (!this.editor.isActive(this.name)) {
            return false;
          }

          const { state } = this.editor;
          const { doc, selection } = state;
          const $from = selection.$from;

          // Find the depth of the surrounding instruction block
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

          // Only trigger when at the start of the first paragraph in the block
          const childIndex = $from.index(blockDepth);
          
          const isAtStartOfTextBlock =
            selection.empty && $from.parentOffset === 0;
          const isInFirstChild = childIndex === 0;

          if (!isAtStartOfTextBlock || !isInFirstChild) {
            return false;
          }

          const posBeforeBlock = $from.before(blockDepth);

          // Ensure a paragraph exists before the block
          const $before = doc.resolve(posBeforeBlock);
          const prevNode = $before.nodeBefore;
          if (!prevNode || prevNode.type.name !== "paragraph") {
            this.editor.commands.insertContentAt(posBeforeBlock, {
              type: "paragraph",
            });
          }

          // Resolve positions from the updated document after potential insertion
          const updatedDoc = this.editor.state.doc;
          const $beforeAfterInsert = updatedDoc.resolve(posBeforeBlock);
          const prevNodeAfterInsert = $beforeAfterInsert.nodeBefore;
          const cursorPos =
            prevNodeAfterInsert && prevNodeAfterInsert.type.name === "paragraph"
              ? posBeforeBlock - 1
              : 1;

          this.editor.commands.setTextSelection(cursorPos);
          this.editor.commands.focus();
          return true;
        },
      };
    },

    addProseMirrorPlugins() {
      return [
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
