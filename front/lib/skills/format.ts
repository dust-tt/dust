export type SkillTag = {
  id: string;
  name: string;
};

export const SKILL_TAG_NAME = "skill";

export const SKILL_TAG_REGEX = /<skill\s+([^>]*?)\s*\/>/g;
export const SKILL_TAG_REGEX_BEGINNING = /^<skill\s+([^>]*?)\s*\/>/;

const XML_ENTITY_REPLACEMENTS: Record<string, string> = {
  "&quot;": '"',
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
};

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function decodeXml(text: string): string {
  return text.replaceAll(
    /&quot;|&lt;|&gt;|&amp;/g,
    (match) => XML_ENTITY_REPLACEMENTS[match] ?? match
  );
}

function parseSkillTagAttributes(attributes: string): SkillTag | null {
  const id = attributes.match(/\bid="([^"]+)"/)?.[1];
  const name = attributes.match(/\bname="([^"]+)"/)?.[1];

  if (!id || !name) {
    return null;
  }

  return {
    id: decodeXml(id),
    name: decodeXml(name),
  };
}

export function parseSkillTag(tag: string): SkillTag | null {
  const attributes = SKILL_TAG_REGEX_BEGINNING.exec(tag)?.[1];

  if (!attributes) {
    return null;
  }

  return parseSkillTagAttributes(attributes);
}

export function extractSkillTags(markdown: string): SkillTag[] {
  return [...markdown.matchAll(SKILL_TAG_REGEX)]
    .map((match) => parseSkillTag(match[0]))
    .filter((skill): skill is SkillTag => skill !== null);
}

export function serializeSkillTag({ id, name }: SkillTag): string {
  return `<${SKILL_TAG_NAME} id="${escapeXml(id)}" name="${escapeXml(name)}" />`;
}

export function replaceSkillTagsWithDirectives(markdown: string): string {
  return markdown.replace(SKILL_TAG_REGEX, (match) => {
    const skill = parseSkillTag(match);
    if (!skill) {
      return match;
    }

    return `:skill[${skill.name}]{sId=${skill.id}}`;
  });
}

export function replaceSkillTagsWithSlashNames(markdown: string): string {
  return markdown.replace(SKILL_TAG_REGEX, (match) => {
    const skill = parseSkillTag(match);
    if (!skill) {
      return match;
    }

    return `/${skill.name}`;
  });
}
