import type { CapabilityFormData } from "@app/components/agent_builder/types";
import { compareStrings } from "@app/lib/i18n/format";
import type { AssistantTemplateListType } from "@app/lib/resources/template_resource";
import type { TemplateTagCodeType } from "@app/types/assistant/templates";
import { useController } from "react-hook-form";

export function getUniqueTemplateTags(
  templates: AssistantTemplateListType[]
): TemplateTagCodeType[] {
  return Array.from(
    new Set(templates.flatMap((template) => template.tags))
  ).sort((a, b) => compareStrings(a.toLowerCase(), b.toLowerCase()));
}

/**
 * Helper hook to access the `sources`.
 * As a single `useController` can be use to access a given attribute.
 */
export function useSourcesFormController() {
  return useController<CapabilityFormData, "sources">({ name: "sources" });
}
