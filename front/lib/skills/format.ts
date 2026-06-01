export type SkillReference = {
  id: string;
  icon: string | null;
  name: string;
};

export const SKILL_TAG_NAME = "skill";

export const SKILL_TAG_REGEX = /<skill\s+([^>]*?)\s*\/>/g;
export const SKILL_TAG_REGEX_BEGINNING = /^<skill\s+([^>]*?)\s*\/>/;

const SKILL_ELEMENT_REGEX = /<skill\b([^>]*)>[\s\S]*?<\/skill>/g;

function parseSkillTagAttributes(attributes: string): SkillReference | null {
  const id = attributes.match(/\bid="([^"]+)"/)?.[1];
  const name = attributes.match(/\bname="([^"]+)"/)?.[1];
  const icon = attributes.match(/\bicon="([^"]+)"/)?.[1];

  if (!id || !name) {
    return null;
  }

  return {
    id,
    icon: icon ?? null,
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

export function extractSkillTags(content: string): SkillReference[] {
  return [...content.matchAll(SKILL_TAG_REGEX)]
    .map((match) => parseSkillTag(match[0]))
    .filter((skill): skill is SkillReference => skill !== null);
}

export function extractUniqueSkillIds(content: string): string[] {
  return [...new Set(extractSkillTags(content).map((skill) => skill.id))];
}

export function serializeSkillTag({ id, name, icon }: SkillReference): string {
  const iconAttribute = icon ? ` icon="${icon}"` : "";

  return `<${SKILL_TAG_NAME} id="${id}" name="${name}"${iconAttribute} />`;
}

export function stripSkillTagPresentationAttributes(content: string): string {
  return content
    .replace(SKILL_ELEMENT_REGEX, (tag, attributes: string) => {
      const skill = parseSkillTag(`<${SKILL_TAG_NAME}${attributes} />`);
      if (!skill) {
        return tag.replace(/(<skill\b[^>]*?)\s+icon="[^"]*"/, "$1");
      }

      return serializeSkillTag({
        ...skill,
        icon: null,
      });
    })
    .replace(SKILL_TAG_REGEX, (tag) => {
      const skill = parseSkillTag(tag);
      if (!skill) {
        return tag.replace(/\s+icon="[^"]*"/g, "");
      }

      return serializeSkillTag({
        ...skill,
        icon: null,
      });
    });
}
