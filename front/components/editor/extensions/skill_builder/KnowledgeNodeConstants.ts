// Pure constants for the knowledge node — kept React-free so server-side
// code (e.g. skill_instructions_html) can import them without dragging the
// editor's React/TipTap node-view chain into the import graph.
export const KNOWLEDGE_TAG = "knowledge";
export const KNOWLEDGE_TAG_REGEX = new RegExp(
  `^<${KNOWLEDGE_TAG}\\s+([^>]+)\\s*/>`
);
const KNOWLEDGE_TAG_REGEX_GLOBAL = new RegExp(
  `<${KNOWLEDGE_TAG}\\s+([^>]+)\\s*/>`,
  "g"
);

export function extractKnowledgeTagIds(content: string): string[] {
  const ids = [...content.matchAll(KNOWLEDGE_TAG_REGEX_GLOBAL)].flatMap(
    (match) => {
      const id = /\bid="([^"]+)"/.exec(match[1])?.[1];
      return id ? [id] : [];
    }
  );

  return [...new Set(ids)];
}
