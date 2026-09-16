import { escapeXml } from "@app/types/shared/utils/string_utils";

export type KnowledgeReference = {
  dataSourceViewId: string | null;
  id: string;
  sourceUrl: string | null;
  spaceId: string | null;
  title: string;
};

export const KNOWLEDGE_TAG_NAME = "knowledge";

export const KNOWLEDGE_TAG_REGEX = /<knowledge\s+([^>]*?)\s*\/>/g;
const KNOWLEDGE_TAG_REGEX_BEGINNING = /^<knowledge\s+([^>]*?)\s*\/>/;

function parseAttribute(attributes: string, name: string): string | null {
  const value = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attributes)?.[1];
  if (value === undefined || value === "") {
    return null;
  }
  return value;
}

export function parseKnowledgeTag(tag: string): KnowledgeReference | null {
  const attributes = KNOWLEDGE_TAG_REGEX_BEGINNING.exec(tag)?.[1];
  if (!attributes) {
    return null;
  }

  const id = parseAttribute(attributes, "id");
  const title = parseAttribute(attributes, "title");
  if (!id || !title) {
    return null;
  }

  return {
    dataSourceViewId: parseAttribute(attributes, "dsv"),
    id,
    sourceUrl: parseAttribute(attributes, "url"),
    spaceId: parseAttribute(attributes, "space"),
    title,
  };
}

export function extractKnowledgeTagNodeIds(content: string): Set<string> {
  const nodeIds = new Set<string>();
  for (const match of content.matchAll(KNOWLEDGE_TAG_REGEX)) {
    const knowledge = parseKnowledgeTag(match[0]);
    if (knowledge?.id) {
      nodeIds.add(knowledge.id);
    }
  }
  return nodeIds;
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
