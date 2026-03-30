import type { NodeSpec } from "prosemirror-model";

export const INSTRUCTION_BLOCK_NODE_NAME = "instructionBlock";
export const INSTRUCTION_BLOCK_SELECTOR = "div[data-type='instruction-block']";

/**
 * Pure ProseMirror NodeSpec for the instructionBlock node.
 * No @tiptap/* or React imports — safe to use server-side.
 * InstructionBlockExtension.tsx derives its structural properties from this spec.
 */
export const instructionBlockSpec: NodeSpec = {
  content: "block+",
  group: "block",
  defining: true,
  isolating: true,
  parseDOM: [{ tag: INSTRUCTION_BLOCK_SELECTOR }],
  toDOM() {
    return ["div", { "data-type": "instruction-block" }, 0];
  },
};
