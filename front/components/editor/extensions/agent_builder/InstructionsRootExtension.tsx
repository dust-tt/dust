import { Node } from "@tiptap/core";

import { BLOCK_ID_ATTRIBUTE } from "./BlockIdExtension";

export const INSTRUCTIONS_ROOT_NODE_NAME = "instructionsRoot";
export const INSTRUCTIONS_ROOT_DATA_TYPE = "instructions-root";
export const INSTRUCTIONS_ROOT_ID = INSTRUCTIONS_ROOT_DATA_TYPE;

// Wrapper node that sits between doc and the block-level content.
// Carries a stable block-id so the copilot can target it to replace
// the entire editor content at once via the suggestion system.
export const InstructionsRootExtension = Node.create({
  name: INSTRUCTIONS_ROOT_NODE_NAME,

  content: "block+",

  addAttributes() {
    return {
      [BLOCK_ID_ATTRIBUTE]: {
        default: INSTRUCTIONS_ROOT_ID,
        parseHTML: (element) =>
          element.getAttribute(`data-${BLOCK_ID_ATTRIBUTE}`) ??
          INSTRUCTIONS_ROOT_ID,
        renderHTML: (attributes) => ({
          [`data-${BLOCK_ID_ATTRIBUTE}`]:
            attributes[BLOCK_ID_ATTRIBUTE] ?? INSTRUCTIONS_ROOT_ID,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-type='${INSTRUCTIONS_ROOT_DATA_TYPE}']` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      { "data-type": INSTRUCTIONS_ROOT_DATA_TYPE, ...HTMLAttributes },
      0,
    ];
  },
});
