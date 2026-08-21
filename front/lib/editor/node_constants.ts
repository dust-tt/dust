// Node identifiers shared by the editor extensions and the server-side markdown
// pipeline. They live outside the extension modules because importing one of
// those runs `Node.create(...)` and loads tiptap, which the server does not need
// until it actually renders instructions.

export const BLOCK_ID_ATTRIBUTE = "block-id";

// Node types that receive block IDs
export const BLOCK_ID_UNIQUE_ID_NODE_TYPES = [
  "codeBlock",
  "heading",
  "instructionBlock",
  "orderedList",
  "paragraph",
  "bulletList",
] as const;

export const INSTRUCTIONS_ROOT_NODE_NAME = "instructionsRoot";

export const SKILL_NODE_TYPE = "skill";

export const TOOL_NODE_TYPE = "toolNode";
