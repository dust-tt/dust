import { Chip, cn, IconButton, XMarkIcon } from "@dust-tt/sparkle";
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
import React, { useEffect, useRef, useState } from "react";

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

interface InstructionBlockTypeInputProps {
  currentType: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}

const InstructionBlockTypeInput: React.FC<InstructionBlockTypeInputProps> = ({
  currentType,
  onChange,
  onBlur,
}) => {
  const [localType, setLocalType] = useState<string>(currentType);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const skipCommitRef = useRef<boolean>(false);

  useEffect(() => {
    setLocalType(currentType);
  }, [currentType]);

  return (
    <input
      ref={inputRef}
      name="instruction-type"
      type="text"
      autoFocus
      value={localType}
      onChange={(e) => setLocalType(e.target.value)}
      onBlur={() => {
        onBlur();
        if (!skipCommitRef.current) {
          onChange(localType.trim());
        }
        skipCommitRef.current = false;
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          inputRef.current?.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          skipCommitRef.current = true;
          inputRef.current?.blur();
        }
      }}
      className={cn(
        "w-fit rounded-lg border-none",
        "mt-0.5 min-h-5 gap-0.5 rounded-md px-1.5 py-1 text-xs font-medium",
        "dark:bg-background-night dark:text-foreground-night",
        "uppercase",
        "focus-visible:s-border-border-focus dark:focus-visible:s-border-border-focus-night",
        "focus-visible:s-outline-none focus-visible:s-ring-2",
        "focus-visible:s-ring-highlight/20 dark:focus-visible:s-ring-highlight/50"
      )}
      placeholder={localType}
    />
  );
};

interface InstructionBlockTypeButtonProps {
  type: string;
  onClick: () => void;
}

const InstructionBlockTypeButton: React.FC<InstructionBlockTypeButtonProps> = ({
  type,
  onClick,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-text"
      aria-label="Edit instruction type"
    >
      <Chip size="mini">{type.toUpperCase()}</Chip>
    </button>
  );
};

const InstructionBlockComponent: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  deleteNode,
}) => {
  const { type } = node.attrs as InstructionBlockAttributes;
  const [isEditingType, setIsEditingType] = useState(false);

  return (
    <NodeViewWrapper className="my-2">
      <div className="rounded-lg border border-border bg-gray-100 p-2 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          {isEditingType ? (
            <InstructionBlockTypeInput
              currentType={type}
              onBlur={() => setIsEditingType(false)}
              onChange={(newType) => {
                if (newType) {
                  updateAttributes({ type: newType });
                }
              }}
            />
          ) : (
            <InstructionBlockTypeButton
              type={type}
              onClick={() => setIsEditingType(true)}
            />
          )}
          <IconButton
            icon={XMarkIcon}
            variant="plain"
            size="mini"
            onClick={() => deleteNode?.()}
            aria-label="Remove instruction block"
          />
        </div>
        <NodeViewContent className="prose prose-sm pt-2" />
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
            // Use the tag name if provided, otherwise default to empty string
            // The user can edit it after creation
            const type = match[1] ? match[1].toLowerCase() : "";

            if (this.editor.isActive(this.name)) {
              return;
            }

            commands.insertContentAt(
              { from: range.from, to: range.to },
              {
                type: this.name,
                attrs: { type: type || "instructions" }, // Default to "instructions" if empty
                content: [{ type: "paragraph" }],
              }
            );
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
          const isBlockEmpty = blockNode.textContent.trim().length === 0;

          if (!isBlockEmpty) {
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
         * Handles Enter to leave the block when hitting enter at the last line of the block.
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

          const tr = state.tr;
          const blockNode = $from.node(blockDepth);
          const posBeforeBlock = $from.before(blockDepth);
          const posAfterBlock = posBeforeBlock + blockNode.nodeSize;

          // Check if we're at the last line of the block
          const isInLastChildOfBlock =
            $from.index(blockDepth) === blockNode.childCount - 1;

          if (!isInLastChildOfBlock) {
            // Let default behavior handle non-last lines
            return false;
          }

          // Current paragraph inside the block
          const paragraphNode = $from.node(blockDepth + 1);
          const isParagraphEmpty =
            paragraphNode &&
            paragraphNode.type.name === "paragraph" &&
            paragraphNode.textContent.trim().length === 0;

          if (!isParagraphEmpty) {
            // Let default behavior handle non-empty lines
            return false;
          }

          const $after = tr.doc.resolve(posAfterBlock);
          const nextNode = $after.nodeAfter;
          if (!nextNode || nextNode.type.name !== "paragraph") {
            tr.insert(posAfterBlock, state.schema.nodes.paragraph.create());
          }
          tr.setSelection(TextSelection.create(tr.doc, posAfterBlock + 1));

          // Trim the last paragraph of the block if it's not the only paragraph
          if (blockNode.childCount > 1) {
            const lastChildIndex = blockNode.childCount - 1;
            const lastChild = blockNode.child(lastChildIndex);
            if (lastChild.type.name === "paragraph") {
              let pos = posBeforeBlock + 1;
              for (let i = 0; i < lastChildIndex; i++) {
                pos += blockNode.child(i).nodeSize;
              }
              tr.delete(pos, pos + lastChild.nodeSize);
            }
          }

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
          },
        }),
      ];
    },
  });
