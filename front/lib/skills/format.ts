export type SkillReference = {
  id: string;
  icon: string;
  name: string;
};

export const SKILL_TAG_NAME = "skill";

export const SKILL_TAG_REGEX = /<skill\s+([^>]*?)\s*\/>/g;
export const SKILL_TAG_REGEX_BEGINNING = /^<skill\s+([^>]*?)\s*\/>/;

function parseSkillTagAttributes(attributes: string): SkillReference | null {
  const id = attributes.match(/\bid="([^"]+)"/)?.[1];
  const name = attributes.match(/\bname="([^"]+)"/)?.[1];
  const icon = attributes.match(/\bicon="([^"]+)"/)?.[1];

  if (!id || !name || !icon) {
    return null;
  }

  return {
    id,
    icon,
    name,
  };
}

export function parseSkillTag(tag: string): SkillReference | null {
  const attributes = SKILL_TAG_REGEX_BEGINNING.exec(tag)?.[1];

  if (!attributes) {
    return null;
  }

  return parseSkillTagAttributes(attributes);
}

export function extractSkillTags(markdown: string): SkillReference[] {
  return [...markdown.matchAll(SKILL_TAG_REGEX)]
    .map((match) => parseSkillTag(match[0]))
    .filter((skill): skill is SkillReference => skill !== null);
}

export function extractUniqueSkillIds(markdown: string): string[] {
  return Array.from(
    new Set(extractSkillTags(markdown).map((skill) => skill.id))
  );
}

export function serializeSkillTag({ id, name, icon }: SkillReference): string {
  return `<${SKILL_TAG_NAME} id="${id}" name="${name}" icon="${icon}" />`;
}
