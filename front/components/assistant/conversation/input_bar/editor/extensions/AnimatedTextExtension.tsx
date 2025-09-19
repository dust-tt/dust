import { AnimatedText } from "@dust-tt/sparkle";
import { findChildren, mergeAttributes, Node } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import React from "react";

const AnimatedTextNodeView = (props: NodeViewProps) => {
  return (
    <NodeViewWrapper as="span" editable={false}>
      <AnimatedText variant="muted">{props.node.textContent}</AnimatedText>
    </NodeViewWrapper>
  );
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    animatedText: {
      enterAnimatedText: () => ReturnType;
      insertAnimatedText: (text: string) => ReturnType;
      clearAllAnimatedText: (options?: {
        deleteContent?: boolean;
      }) => ReturnType;
    };
  }
}

export const AnimatedTextExtension = Node.create({
  name: "animatedText",
  inline: true,
  group: "inline",
  content: "text*",
  atom: false,
  selectable: false,

  parseHTML() {
    return [{ tag: "span[data-animated-text]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-animated-text": "true" }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AnimatedTextNodeView);
  },

  addCommands() {
    return {
      enterAnimatedText:
        () =>
        ({ state }) => {
          const node = this.type.create();
          const { from } = state.selection;
          const tr = state.tr.insert(from, node);
          tr.setSelection(TextSelection.create(tr.doc, from + 1));

          return true;
        },

      insertAnimatedText:
        (text: string) =>
        ({ state }) => {
          const content = state.schema.text(text);
          const node = this.type.create(null, content);
          const { from } = state.selection;
          const tr = state.tr.replaceSelectionWith(node, false);
          // const pos = tr.selection.from; // selection moved to after insert
          // const start = pos - node.nodeSize + 1;
          // const end = start + (text ? text.length : 0);
          const posAfter = from + node.nodeSize;
          tr.setSelection(TextSelection.create(tr.doc, posAfter));

          return true;
        },

      clearAllAnimatedText:
        (options) =>
        ({ state }) => {
          const deleteContent = options?.deleteContent ?? false;
          const type = this.type;
          const matches = findChildren(state.doc, (n) => n.type === type);
          if (!matches.length) {
            return true;
          }

          const tr = state.tr;
          for (let i = matches.length - 1; i >= 0; i--) {
            const { pos, node } = matches[i];
            if (deleteContent) {
              tr.delete(pos, pos + node.nodeSize);
            } else {
              tr.replaceWith(
                pos,
                pos + node.nodeSize,
                node.content || Fragment.empty
              );
            }
          }

          return true;
        },
    };
  },
});
