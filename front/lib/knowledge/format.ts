import { escapeXml } from "@app/types/shared/utils/string_utils";

export const KNOWLEDGE_TAG_NAME = "knowledge";

const KNOWLEDGE_TAG_REGEX = /<knowledge\s+([^>]*?)\s*\/>/g;

function parseAttribute(attributes: string, name: string): string | null {
  const value = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attributes)?.[1];
  if (value === undefined || value === "") {
    return null;
  }
  return value;
}

/**
 * Strips presentation/internal attributes from inline <knowledge> tags so the
 * model only sees a stable, human-meaningful reference (the title). The document
 * content itself is delivered separately as a conversation content fragment, so
 * the internal ids (id/space/dsv/hasChildren) carry no value for the model and
 * only add noise. Mirrors stripToolTagPresentationAttributes / stripSkillTag...
 */
export function stripKnowledgeTagPresentationAttributes(
  content: string
): string {
  return content.replace(KNOWLEDGE_TAG_REGEX, (tag, attributes: string) => {
    const title = parseAttribute(attributes, "title");
    if (!title) {
      return tag;
    }
    return `<${KNOWLEDGE_TAG_NAME} title="${escapeXml(title)}" />`;
  });
}
