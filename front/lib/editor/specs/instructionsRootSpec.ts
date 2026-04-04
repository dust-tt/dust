import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import type { NodeSpec } from "prosemirror-model";

export const INSTRUCTIONS_ROOT_NODE_NAME = "instructionsRoot";
export const INSTRUCTIONS_ROOT_SELECTOR = `div[data-type='${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}']`;

/**
 * Pure ProseMirror NodeSpec for the instructionsRoot node.
 * No @tiptap/* or React imports — safe to use server-side.
 * InstructionsRootExtension.tsx derives its structural properties from this spec.
 */
export const instructionsRootSpec: NodeSpec = {
  content: "block+",
  parseDOM: [{ tag: INSTRUCTIONS_ROOT_SELECTOR }],
  toDOM() {
    return ["div", { "data-type": INSTRUCTIONS_ROOT_TARGET_BLOCK_ID }, 0];
  },
};
