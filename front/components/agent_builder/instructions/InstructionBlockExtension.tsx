import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";
import type { NodeViewProps } from "@tiptap/react";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import React from "react";
import { Slice, Fragment } from "@tiptap/pm/model";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

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
        <div className="mb-3">
          <span
            className="select-none text-sm font-semibold uppercase tracking-wider text-muted-foreground"
            contentEditable={false}
          >
            {type.toUpperCase()}
          </span>
        </div>
        <div className="min-h-[3rem] rounded border border-border/50 bg-background p-3">
          <NodeViewContent className="prose prose-sm max-w-none outline-none" />
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
    draggable: true,

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
          find: /<(\w+)>$/,
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
              const regex = /<(\w+)>([\s\S]*?)<\/\1>/g;
              if (!regex.test(textContent)) {
                return false; // Let default paste behavior handle it
              }

              // Parse the content and create nodes
              const nodes: ProseMirrorNode[] = [];
              let lastIndex = 0;
              let match;

              regex.lastIndex = 0; // Reset regex
              while ((match = regex.exec(textContent)) !== null) {
                // Add text before the XML tag as paragraphs
                if (match.index > lastIndex) {
                  const beforeText = textContent.slice(lastIndex, match.index);
                  const lines = beforeText
                    .split("\n")
                    .filter((line) => line.trim());
                  lines.forEach((line) => {
                    nodes.push(
                      schema.nodes.paragraph.create({}, [schema.text(line)])
                    );
                  });
                }

                // Process the XML tag
                const type = match[1].toLowerCase();
                const content = match[2].trim();

                // Create paragraph nodes from content
                const paragraphs = content.split("\n").map((line) => {
                  const trimmedLine = line.trim();
                  return schema.nodes.paragraph.create(
                    {},
                    trimmedLine ? [schema.text(trimmedLine)] : []
                  );
                });

                const blockContent =
                  paragraphs.length > 0
                    ? paragraphs
                    : [schema.nodes.paragraph.create()];

                nodes.push(this.type.create({ type }, blockContent));

                lastIndex = match.index + match[0].length;
              }

              // Add remaining text
              if (lastIndex < textContent.length) {
                const remainingText = textContent.slice(lastIndex);
                const lines = remainingText
                  .split("\n")
                  .filter((line) => line.trim());
                lines.forEach((line) => {
                  nodes.push(
                    schema.nodes.paragraph.create({}, [schema.text(line)])
                  );
                });
              }

              // Insert the nodes
              const { from } = state.selection;
              nodes.forEach((node, index) => {
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

              const regex = /<(\w+)>([\s\S]*?)<\/\1>/g;
              let match;

              while ((match = regex.exec(node.text)) !== null) {
                const matchStart = pos + match.index;
                const matchEnd = matchStart + match[0].length;
                const type = match[1].toLowerCase();
                const content = match[2].trim();

                // Create paragraph nodes from content
                const paragraphs = content.split("\n").map((line) => {
                  const trimmedLine = line.trim();
                  return schema.nodes.paragraph.create(
                    {},
                    trimmedLine ? [schema.text(trimmedLine)] : []
                  );
                });

                const blockContent =
                  paragraphs.length > 0
                    ? paragraphs
                    : [schema.nodes.paragraph.create()];

                const instructionBlock = this.type.create(
                  { type },
                  blockContent
                );

                tr.replaceWith(matchStart, matchEnd, instructionBlock);

                // Position cursor in the block
                const blockPos = matchStart + 1;
                const paragraphPos = blockPos + 1;
                tr.setSelection(TextSelection.create(tr.doc, paragraphPos));

                modified = true;
              }
            });

            return modified ? tr : null;
          },
        }),
      ];
    },
  });
