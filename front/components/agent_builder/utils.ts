import { useController } from "react-hook-form";

import type { CapabilityFormData } from "@app/components/agent_builder/types";
import { dataSourceConfigurationSchema } from "@app/components/agent_builder/types";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import type { AssistantTemplateListType } from "@app/pages/api/templates";
import type { Result, TemplateTagCodeType } from "@app/types";
import { Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

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

function validateDataSourceConfiguration(
  config: unknown
): Result<DataSourceConfiguration, Error> {
  try {
    const validated = dataSourceConfigurationSchema.parse(config);
    return new Ok(validated);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

/**
 * Helper hook to access the `sources`.
 * As a single `useController` can be use to access a given attribute.
 */
export function useSourcesFormController() {
  return useController<CapabilityFormData, "sources">({ name: "sources" });
}
