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
