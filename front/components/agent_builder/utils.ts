import type { AssistantTemplateListType } from "@app/pages/api/templates";
import type { TemplateTagCodeType } from "@app/types";

export const isInvalidJson = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }
  try {
    const parsed = JSON.parse(value);
    return !parsed || typeof parsed !== "object";
  } catch {
    return true;
  }
};

export function getUniqueTemplateTags(
  templates: AssistantTemplateListType[]
): TemplateTagCodeType[] {
  return Array.from(
    new Set(templates.flatMap((template) => template.tags))
  ).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
