export type SkillReference = {
  id: string;
  icon: string | null;
  name: string;
  unavailable?: boolean;
};

export const SKILL_TAG_NAME = "skill";
export const UNAVAILABLE_SKILL_TAG_NAME = "unavailable_skill";
export const UNAVAILABLE_SKILL_LABEL = "Unavailable skill";

export const SKILL_TAG_REGEX = /<skill\s+([^>]*?)\s*(?:\/>|><\/skill>)/g;
export const SKILL_TAG_REGEX_BEGINNING =
  /^<skill\s+([^>]*?)\s*(?:\/>|><\/skill>)/;
export const SKILL_REFERENCE_TAG_REGEX =
  /<(skill|unavailable_skill)\s+([^>]*?)\s*(?:\/>|><\/\1>)/g;
export const SKILL_REFERENCE_TAG_REGEX_BEGINNING =
  /^<(skill|unavailable_skill)\s+([^>]*?)\s*(?:\/>|><\/\1>)/;

const SKILL_ELEMENT_REGEX = /<skill\b([^>]*)>[\s\S]*?<\/skill>/g;

function parseSkillTagAttributes(
  attributes: string,
  { unavailable = false }: { unavailable?: boolean } = {}
): SkillReference | null {
  const id = attributes.match(/\bid="([^"]+)"/)?.[1];
  const name = attributes.match(/\bname="([^"]+)"/)?.[1];
  const icon = attributes.match(/\bicon="([^"]+)"/)?.[1];
  const parsedName = unavailable ? UNAVAILABLE_SKILL_LABEL : name;

  if (!id || !parsedName) {
    return null;
  }

  return {
    id,
    icon: icon ?? null,
    name: parsedName,
    unavailable,
  };
}

export function parseSkillTag(tag: string): SkillReference | null {
  const attributes = SKILL_TAG_REGEX_BEGINNING.exec(tag)?.[1];

  if (!attributes) {
    return null;
  }

  return parseSkillTagAttributes(attributes);
}

export function parseSkillReferenceTag(tag: string): SkillReference | null {
  const match = SKILL_REFERENCE_TAG_REGEX_BEGINNING.exec(tag);

  if (!match) {
    return null;
  }

  const [, tagName, attributes] = match;

  return parseSkillTagAttributes(attributes, {
    unavailable: tagName === UNAVAILABLE_SKILL_TAG_NAME,
  });
}

export function extractSkillTags(content: string): SkillReference[] {
  return [...content.matchAll(SKILL_TAG_REGEX)]
    .map((match) => parseSkillTag(match[0]))
    .filter((skill): skill is SkillReference => skill !== null);
}

export function extractUniqueSkillIds(content: string): string[] {
  return [...new Set(extractSkillTags(content).map((skill) => skill.id))];
}

export function extractSkillReferenceTags(content: string): SkillReference[] {
  return [...content.matchAll(SKILL_REFERENCE_TAG_REGEX)]
    .map((match) => parseSkillReferenceTag(match[0]))
    .filter((skill): skill is SkillReference => skill !== null);
}

export function extractUniqueSkillReferenceIds(content: string): string[] {
  return [
    ...new Set(extractSkillReferenceTags(content).map((skill) => skill.id)),
  ];
}

export function serializeSkillTag(
  { id, name, icon }: SkillReference,
  { html = false }: { html?: boolean } = {}
): string {
  const iconAttribute = icon ? ` icon="${icon}"` : "";
  const attributes = `id="${id}" name="${name}"${iconAttribute}`;

  if (html) {
    return `<${SKILL_TAG_NAME} ${attributes}></${SKILL_TAG_NAME}>`;
  }

  return `<${SKILL_TAG_NAME} ${attributes} />`;
}

export function serializeUnavailableSkillTag(
  { id }: { id: string },
  { html = false }: { html?: boolean } = {}
): string {
  if (html) {
    return `<${UNAVAILABLE_SKILL_TAG_NAME} id="${id}"></${UNAVAILABLE_SKILL_TAG_NAME}>`;
  }

  return `<${UNAVAILABLE_SKILL_TAG_NAME} id="${id}" />`;
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

// Matches a <skill ...> opening tag, whether self-closing (<skill ... />, the
// form stored in the markdown `instructions`) or paired (<skill ...></skill>,
// the form stored in the rendered `instructionsHtml`).
const SKILL_OPEN_TAG_REGEX = /<skill\b[^>]*?\/?>/g;

const SKILL_NAME_ATTRIBUTE_REGEX = /(\bname=")[^"]*(")/;

/**
 * Rewrites the `name` attribute of every inline reference to `skillId` from
 * `previousName` to `newName`, leaving all other skill tags untouched. Used to
 * propagate a skill rename into the instructions of skills that reference it
 * inline. References are matched by `id` (always present in the Markdown
 * `instructions` and in client-saved `instructionsHtml`).
 */
export function renameSkillReferencesInContent(
  content: string,
  { skillId, newName }: { skillId: string; newName: string }
): string {
  return content.replace(SKILL_OPEN_TAG_REGEX, (tag) => {
    const id = tag.match(/\bid="([^"]+)"/)?.[1];

    if (id === skillId) {
      return tag.replace(
        SKILL_NAME_ATTRIBUTE_REGEX,
        (_match, prefix: string, suffix: string) =>
          `${prefix}${newName}${suffix}`
      );
    }

    return tag;
  });
}

/**
 * Rewrites inline references to `skillId` into unavailable placeholders. This
 * is used when a referenced skill can no longer be used by parent skills.
 */
export function replaceSkillReferencesWithUnavailableInContent(
  content: string,
  { skillId }: { skillId: string }
): string {
  return content
    .replace(SKILL_ELEMENT_REGEX, (tag, attributes: string) => {
      const skill = parseSkillTag(`<${SKILL_TAG_NAME}${attributes} />`);

      if (skill?.id !== skillId) {
        return tag;
      }

      return serializeUnavailableSkillTag({ id: skillId }, { html: true });
    })
    .replace(SKILL_TAG_REGEX, (tag) => {
      const skill = parseSkillTag(tag);

      if (skill?.id !== skillId) {
        return tag;
      }

      return serializeUnavailableSkillTag({ id: skillId });
    });
}
