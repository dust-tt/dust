import { escape, unescape } from "html-escaper";

export const SKILL_REFERENCE_TAG = "skill";

export interface SerializedSkillReference {
  name: string;
  skillId: string;
}

const SELF_CLOSING_SKILL_REFERENCE_REGEX = new RegExp(
  `<${SKILL_REFERENCE_TAG}\\s+([^>]+)\\s*/>`,
  "g",
);

const SKILL_REFERENCE_TAG_REGEX = new RegExp(
  `<${SKILL_REFERENCE_TAG}\\s+([^>]+?)(?:\\s*/>|>[\\s\\S]*?</${SKILL_REFERENCE_TAG}>)`,
  "g",
);

function parseXmlLikeAttributes(attributesString: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const attributeRegex = /([A-Za-z0-9_-]+)="([^"]*)"/g;

  for (const match of attributesString.matchAll(attributeRegex)) {
    attrs.set(match[1], unescape(match[2]));
  }

  return attrs;
}

export function serializeSkillReference({
  name,
  skillId,
}: SerializedSkillReference): string {
  return `<${SKILL_REFERENCE_TAG} name="${escape(name)}" id="${escape(skillId)}" />`;
}

export function parseSkillReferences(
  instructions: string,
): SerializedSkillReference[] {
  const referencesById = new Map<string, SerializedSkillReference>();

  for (const match of instructions.matchAll(SKILL_REFERENCE_TAG_REGEX)) {
    const attrs = parseXmlLikeAttributes(match[1]);
    const skillId = attrs.get("id");
    const name = attrs.get("name");

    if (!skillId || !name || referencesById.has(skillId)) {
      continue;
    }

    referencesById.set(skillId, { skillId, name });
  }

  return [...referencesById.values()];
}

export function replaceSkillReferenceName(
  instructions: string,
  {
    name,
    skillId,
  }: {
    name: string;
    skillId: string;
  },
): string {
  return instructions.replaceAll(
    SELF_CLOSING_SKILL_REFERENCE_REGEX,
    (fullMatch, attributesString: string) => {
      const attrs = parseXmlLikeAttributes(attributesString);

      if (attrs.get("id") !== skillId) {
        return fullMatch;
      }

      return serializeSkillReference({ name, skillId });
    },
  );
}
