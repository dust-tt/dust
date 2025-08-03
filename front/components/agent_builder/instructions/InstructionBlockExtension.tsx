import { mergeAttributes, Node, nodeInputRule, InputRule } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import {
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";
import React from "react";

type InstructionBlockType = "info" | "approach" | "tools";

interface InstructionBlockAttributes {
  type: InstructionBlockType;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    instructionBlock: {
      setInstructionBlock: (
        attributes?: InstructionBlockAttributes
      ) => ReturnType;
      insertInstructionBlock: (type: InstructionBlockType) => ReturnType;
      insertParagraphAfterBlock: () => ReturnType;
      insertParagraphBeforeBlock: () => ReturnType;
    };
  }
}

const InstructionBlockComponent = ({ node }: NodeViewProps) => {
  const { type } = node.attrs as InstructionBlockAttributes;

  const typeDisplayMap: Record<InstructionBlockType, string> = {
    info: "INFO",
    approach: "APPROACH",
    tools: "TOOLS",
  };

  return (
    <NodeViewWrapper className="my-4">
      <div className="rounded-lg border border-border bg-muted-background p-4">
        {/* Section Header */}
        <div className="mb-3">
          <span
            className="select-none text-sm font-semibold uppercase tracking-wider text-muted-foreground"
            contentEditable={false}
          >
            {typeDisplayMap[type]}
          </span>
        </div>

        {/* Editable Content Area */}
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
          default: "info" as InstructionBlockType,
          parseHTML: (element) => {
            const dataType = element.getAttribute("data-instruction-type");
            return (dataType as InstructionBlockType) || "info";
          },
          renderHTML: (attributes) => {
            if (!attributes.type) {
              return {};
            }
            return {
              "data-instruction-type": attributes.type,
            };
          },
        },
      };
    },

    parseHTML() {
      return [
        {
          tag: "div[data-type='instruction-block']",
        },
        // Parse XML-style tags directly from HTML content
        {
          tag: "info",
          getAttrs: () => ({ type: "info" }),
        },
        {
          tag: "approach",
          getAttrs: () => ({ type: "approach" }),
        },
        {
          tag: "tools",
          getAttrs: () => ({ type: "tools" }),
        },
      ];
    },

    renderHTML({ HTMLAttributes, node }) {
      const { type } = node.attrs as InstructionBlockAttributes;

      // For serialization to XML format, render as the XML tag
      if (HTMLAttributes["data-serialize-as-xml"]) {
        return [type.toUpperCase(), {}, 0];
      }

      // For normal HTML rendering, use div with data attributes
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
          ({ commands }) => {
            return commands.setNode(this.name, attributes);
          },

        insertInstructionBlock:
          (type: InstructionBlockType) =>
          ({ commands }) => {
            return commands.insertContent({
              type: this.name,
              attrs: { type },
              content: [{ type: "paragraph" }],
            });
          },

        insertParagraphAfterBlock:
          () =>
          ({ state, dispatch }) => {
            const { selection } = state;
            const { $from } = selection;

            // Find if we're in an instruction block
            for (let depth = $from.depth; depth >= 0; depth--) {
              const node = $from.node(depth);
              if (node.type.name === this.name) {
                const blockPos = $from.start(depth);
                const blockEnd = blockPos + node.nodeSize;

                if (dispatch) {
                  const tr = state.tr.insert(
                    blockEnd,
                    state.schema.nodes.paragraph.create()
                  );
                  tr.setSelection(
                    TextSelection.near(tr.doc.resolve(blockEnd + 1))
                  );
                  dispatch(tr);
                }
                return true;
              }
            }
            return false;
          },

        insertParagraphBeforeBlock:
          () =>
          ({ state, dispatch }) => {
            const { selection } = state;
            const { $from } = selection;

            // Find if we're in an instruction block
            for (let depth = $from.depth; depth >= 0; depth--) {
              const node = $from.node(depth);
              if (node.type.name === this.name) {
                const blockPos = $from.start(depth);

                if (dispatch) {
                  const tr = state.tr.insert(
                    blockPos,
                    state.schema.nodes.paragraph.create()
                  );
                  tr.setSelection(
                    TextSelection.near(tr.doc.resolve(blockPos + 1))
                  );
                  dispatch(tr);
                }
                return true;
              }
            }
            return false;
          },
      };
    },

    addKeyboardShortcuts() {
      return {
        "Mod-Shift-i": () => {
          return this.editor.commands.insertInstructionBlock("info");
        },
        "Mod-Shift-a": () => {
          return this.editor.commands.insertInstructionBlock("approach");
        },
        "Mod-Shift-t": () => {
          return this.editor.commands.insertInstructionBlock("tools");
        },
        "Mod-Enter": ({ editor }) => {
          // Create paragraph after block
          return editor.commands.insertParagraphAfterBlock();
        },
        "Mod-Shift-Enter": ({ editor }) => {
          // Create paragraph before block
          return editor.commands.insertParagraphBeforeBlock();
        },
        ArrowUp: ({ editor }) => {
          const { selection, doc } = editor.state;
          const { $from } = selection;

          // Check if we're at the start of an instruction block
          if (
            $from.depth >= 2 &&
            $from.node($from.depth - 1).type.name === this.name
          ) {
            const blockPos = $from.start($from.depth - 1);
            if ($from.parentOffset === 0 && $from.pos === $from.start()) {
              // We're at the very start of the block content, move cursor before the block
              const newPos = Math.max(0, blockPos - 1);
              editor.commands.setTextSelection(newPos);
              return true;
            }
          }
          return false;
        },
        ArrowDown: ({ editor }) => {
          const { selection, doc } = editor.state;
          const { $from } = selection;

          // Check if we're at the end of an instruction block
          if (
            $from.depth >= 2 &&
            $from.node($from.depth - 1).type.name === this.name
          ) {
            const blockNode = $from.node($from.depth - 1);
            const blockPos = $from.start($from.depth - 1);
            const blockEnd = blockPos + blockNode.nodeSize;

            // Check if we're at the end of the block content
            if ($from.pos === $from.end()) {
              // Move cursor after the block
              const newPos = Math.min(doc.content.size, blockEnd);
              editor.commands.setTextSelection(newPos);
              return true;
            }
          }
          return false;
        },
      };
    },

    addNodeView() {
      return ReactNodeViewRenderer(InstructionBlockComponent);
    },

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("instructionBlockAutoConvert"),
          appendTransaction: (transactions, oldState, newState) => {
            const docChanged = transactions.some((tr) => tr.docChanged);
            if (!docChanged) return null;

            const { doc, tr } = newState;
            const { schema } = newState;
            let modified = false;

            // Find text nodes that contain complete instruction block patterns
            doc.descendants((node, pos) => {
              if (node.type.name === "text" && node.text) {
                const text = node.text;
                const regex = /<(INFO|APPROACH|TOOLS)>([\s\S]*?)<\/\1>/g;
                let match;

                while ((match = regex.exec(text)) !== null) {
                  const matchStart = pos + match.index;
                  const matchEnd = matchStart + match[0].length;
                  const type = match[1].toLowerCase() as InstructionBlockType;
                  const content = match[2].trim();

                  // Create paragraphs from content
                  const lines = content.split("\n");
                  const paragraphs = lines.map((line) => {
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

                  // Set cursor inside the new block
                  const newBlockPos = matchStart + 1; // Position after the block node
                  const resolvedPos = tr.doc.resolve(newBlockPos);
                  if (resolvedPos.depth > 0) {
                    // Find the first paragraph inside the block and position cursor there
                    const blockNode = resolvedPos.nodeAfter;
                    if (blockNode && blockNode.content.size > 0) {
                      const firstParagraphPos = newBlockPos + 1;
                      tr.setSelection(
                        TextSelection.create(tr.doc, firstParagraphPos)
                      );
                    }
                  }

                  modified = true;
                }
              }
            });

            return modified ? tr : null;
          },
        }),
      ];
    },

    addInputRules() {
      return [
        // Custom input rule for opening tags
        new InputRule({
          find: /<(INFO|APPROACH|TOOLS)>$/,
          handler: ({ state, range, match, commands }) => {
            const type = match[1].toLowerCase() as InstructionBlockType;

            // Use the insertContent command to properly insert the block
            commands.insertContentAt(
              { from: range.from, to: range.to },
              {
                type: this.name,
                attrs: { type },
                content: [{ type: "paragraph" }],
              }
            );

            // Focus will be handled automatically by TipTap
            return null;
          },
        }),
      ];
    },
  });
