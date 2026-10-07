import type { CapabilityFormData } from "@app/components/agent_builder/types";
import { compareStrings } from "@app/lib/i18n/format";
import type { AssistantTemplateListType } from "@app/lib/resources/template_resource";
import type { TemplateTagCodeType } from "@app/types/assistant/templates";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useController } from "react-hook-form";

export const TEMPLATE_TAG_LABELS: Record<
  TemplateTagCodeType,
  MessageDescriptor
> = {
  CONTENT: msg`Content`,
  DATA: msg`Data`,
  DESIGN: msg`Design`,
  ENGINEERING: msg`Engineering`,
  FINANCE: msg`Finance`,
  HIRING: msg`Hiring`,
  IT: msg`IT`,
  LEGAL: msg`Legal`,
  KNOWLEDGE: msg`Knowledge`,
  MARKETING: msg`Marketing`,
  OPERATIONS: msg`Operations`,
  PRODUCT: msg`Product`,
  PRODUCT_MANAGEMENT: msg`Product management`,
  PRODUCTIVITY: msg`Productivity`,
  RECRUITING: msg`Recruiting & people`,
  SALES: msg`Sales`,
  SUPPORT: msg`Support`,
  UX_DESIGN: msg`UX design`,
  UX_RESEARCH: msg`UX research`,
  WRITING: msg`Writing`,
};

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
