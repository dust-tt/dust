import {
  INSTRUCTIONS_ROOT_NODE_NAME,
  INSTRUCTIONS_ROOT_SELECTOR,
  instructionsRootSpec,
} from "@app/lib/editor/specs/instructionsRootSpec";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import { Node } from "@tiptap/core";

import { BLOCK_ID_ATTRIBUTE } from "./BlockIdExtension";

// Wrapper node that sits between doc and the block-level content.
// Carries a stable block-id so the sidekick can target it to replace
// the entire editor content at once via the suggestion system.
export const InstructionsRootExtension = Node.create({
  name: INSTRUCTIONS_ROOT_NODE_NAME,

  content: instructionsRootSpec.content,

  addAttributes() {
    return {
      [BLOCK_ID_ATTRIBUTE]: {
        default: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
        parseHTML: (element) =>
          element.getAttribute(`data-${BLOCK_ID_ATTRIBUTE}`) ??
          INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
        renderHTML: (attributes) => ({
          [`data-${BLOCK_ID_ATTRIBUTE}`]:
            attributes[BLOCK_ID_ATTRIBUTE] ?? INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: INSTRUCTIONS_ROOT_SELECTOR }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      { "data-type": INSTRUCTIONS_ROOT_TARGET_BLOCK_ID, ...HTMLAttributes },
      0,
    ];
  },

  renderMarkdown(node, helpers) {
    return helpers.renderChildren(node.content ?? [], "\n\n");
  },
});
