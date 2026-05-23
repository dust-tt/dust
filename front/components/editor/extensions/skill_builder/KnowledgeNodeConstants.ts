// Pure constants for the knowledge node — kept React-free so server-side
// code (e.g. skill_instructions_html) can import them without dragging the
// editor's React/TipTap node-view chain into the import graph.
export const KNOWLEDGE_TAG = "knowledge";
export const KNOWLEDGE_TAG_REGEX = new RegExp(
  `^<${KNOWLEDGE_TAG}\\s+([^>]+)\\s*/>`
);
