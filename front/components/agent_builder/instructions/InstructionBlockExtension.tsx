import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Slice } from "@tiptap/pm/model";
import { Fragment } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { NodeViewProps } from "@tiptap/react";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import React from "react";

import {
  createProseMirrorInstructionBlock,
  INSTRUCTION_BLOCK_REGEX,
  OPENING_TAG_REGEX,
  parseInstructionBlockMatches,
  splitTextAroundBlocks,
} from "@app/lib/client/agent_builder/instructionBlockUtils";
import { Button, Icon, IconButton, XMarkIcon } from "@dust-tt/sparkle";

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

const InstructionBlockComponent: React.FC<NodeViewProps> = ({ node }) => {
  const { type } = node.attrs as InstructionBlockAttributes;

  return (
    <NodeViewWrapper className="my-4">
      <div className="rounded-lg border border-border bg-gray-100 p-4">
        <span
          className="text-sm font-semibold text-muted-foreground"
          contentEditable={false}
        >
          {type.toUpperCase()}
        </span>
        <div className="min-h-12 rounded border border-border/50 bg-background p-3">
          <NodeViewContent className="prose prose-sm" />
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
    content: "paragraph+",
    defining: true,
    isolating: true,

    addAttributes() {
      return {
        type: {
          default: "info",
          parseHTML: (element) =>
            element.getAttribute("data-instruction-type") || "info",
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
          ({ commands }) =>
            commands.insertContent({
              type: this.name,
              attrs: { type },
              content: [{ type: "paragraph" }],
            }),
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
            const type = match[1].toLowerCase();

            commands.insertContentAt(
              { from: range.from, to: range.to },
              {
                type: this.name,
                attrs: { type },
                content: [{ type: "paragraph" }],
              }
            );
          },
        }),
      ];
    },

    addKeyboardShortcuts() {
      return {
        "Shift-Enter": () => {
          if (!this.editor.isActive(this.name)) {
            return false;
          }
          return this.editor.commands.splitBlock();
        },
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

          // Only trigger when at the end of the last child of the block
          const isAtEndOfTextBlock =
            selection.empty && $from.parentOffset === $from.parent.content.size;
          const isInLastChildOfBlock =
            $from.index(blockDepth) === blockNode.childCount - 1;

          if (!isAtEndOfTextBlock || !isInLastChildOfBlock) {
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

          const blockNode = $from.node(blockDepth);

          // Only trigger when at the start of the first child of the block
          const isAtStartOfTextBlock =
            selection.empty && $from.parentOffset === 0;
          const isInFirstChildOfBlock = $from.index(blockDepth) === 0;

          if (!isAtStartOfTextBlock || !isInFirstChildOfBlock) {
            return false;
          }

          const posBeforeBlock = $from.before(blockDepth);
          const $before = doc.resolve(posBeforeBlock);
          const prevNode = $before.nodeBefore;

          if (!prevNode || prevNode.type.name !== "paragraph") {
            // Create a paragraph before the block if none exists
            this.editor.commands.insertContentAt(posBeforeBlock, {
              type: "paragraph",
            });
          }

          // Place the cursor at the end of the paragraph before the block
          // Find the new position after possible insertion
          const $beforeAfterInsert = doc.resolve(posBeforeBlock);
          const prevNodeAfterInsert = $beforeAfterInsert.nodeBefore;
          let cursorPos;
          if (
            prevNodeAfterInsert &&
            prevNodeAfterInsert.type.name === "paragraph"
          ) {
            // Place cursor at end of previous paragraph
            cursorPos = posBeforeBlock - 1;
          } else {
            // Fallback: place at start of doc
            cursorPos = 1;
          }
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
                  const type = (child.attrs as InstructionBlockAttributes).type;
                  const inner = child.textBetween(0, child.content.size, "\n");
                  parts.push(`<${type}>\n${inner}\n</${type}>`);
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
            handlePaste: (
              view: EditorView,
              event: ClipboardEvent,
              slice: Slice
            ) => {
              const { state } = view;
              const { schema, tr } = state;

              // Get the text content from the slice
              const textContent = slice.content.textBetween(
                0,
                slice.content.size,
                "\n",
                "\n"
              );

              // Check if there are any XML tags
              if (!INSTRUCTION_BLOCK_REGEX.test(textContent)) {
                return false; // Let default paste behavior handle it
              }

              // Parse the content and create nodes
              const nodes: ProseMirrorNode[] = [];
              const segments = splitTextAroundBlocks(textContent);

              segments.forEach((segment) => {
                if (segment.type === "text") {
                  // Add text as paragraphs
                  const lines = segment.content
                    .split("\n")
                    .filter((line) => line.trim());
                  lines.forEach((line) => {
                    nodes.push(
                      schema.nodes.paragraph.create({}, [schema.text(line)])
                    );
                  });
                } else if (segment.type === "block" && segment.blockType) {
                  // Add instruction block
                  const instructionBlock = createProseMirrorInstructionBlock(
                    segment.blockType,
                    segment.content,
                    this.type,
                    schema
                  );
                  nodes.push(instructionBlock);
                }
              });

              // Insert all nodes at once to preserve order
              const { from } = state.selection;
              const fragment = Fragment.fromArray(nodes);
              tr.insert(from, fragment);

              view.dispatch(tr);
              return true; // We handled the paste
            },
          },
          appendTransaction: (transactions, oldState, newState) => {
            if (!transactions.some((tr) => tr.docChanged)) {
              return null;
            }

            const { doc, tr, schema } = newState;
            let modified = false;

            doc.descendants((node, pos) => {
              if (node.type.name !== "text" || !node.text) {
                return;
              }

              const matches = parseInstructionBlockMatches(node.text);

              matches.forEach((match) => {
                const matchStart = pos + match.start;
                const matchEnd = pos + match.end;

                const instructionBlock = createProseMirrorInstructionBlock(
                  match.type,
                  match.content,
                  this.type,
                  schema
                );

                tr.replaceWith(matchStart, matchEnd, instructionBlock);

                // Position cursor in the block
                const blockPos = matchStart + 1;
                const paragraphPos = blockPos + 1;
                tr.setSelection(TextSelection.create(tr.doc, paragraphPos));

                modified = true;
              });
            });

            return modified ? tr : null;
          },
        }),
      ];
    },
  });
