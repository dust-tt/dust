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

function normalizeTagAttributes(attributes: string): string {
  return [...attributes.matchAll(/(\w+)="([^"]*)"/g)]
    .map(([, key, value]) => `${key}="${value}"`)
    .sort()
    .join(" ");
}

export function extractKnowledgeTagSignatures(content: string): string[] {
  const signatures = [...content.matchAll(KNOWLEDGE_TAG_REGEX_GLOBAL)].flatMap(
    (match) => {
      const signature = normalizeTagAttributes(match[1]);
      return signature ? [signature] : [];
    }
  );

  return [...new Set(signatures)];
}
