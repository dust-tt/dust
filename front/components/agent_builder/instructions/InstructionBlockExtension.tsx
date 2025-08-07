import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Slice } from "@tiptap/pm/model";
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
      <div className="rounded-lg border border-border bg-muted-background p-4">
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
    content: "block+",
    defining: true,

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

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("instructionBlockAutoConvert"),
          props: {
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

              // Insert the nodes
              const { from } = state.selection;
              nodes.forEach((node) => {
                const pos = tr.mapping.map(from);
                tr.insert(pos, node);
              });

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
