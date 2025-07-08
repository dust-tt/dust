import { dataSourceConfigurationSchema } from "@app/components/agent_builder/types";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration";
import type { AssistantTemplateListType } from "@app/pages/api/templates";
import type { ModelId, Result, TemplateTagCodeType } from "@app/types";
import { Err, Ok } from "@app/types";
import type { DataSourceViewCategory } from "@app/types/api/public/spaces";
import type { DataSourceType } from "@app/types/data_source";
import type {
  DataSourceViewContentNode,
  DataSourceViewType,
} from "@app/types/data_source_view";
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

export function validateDataSourceConfiguration(
  config: unknown
): Result<DataSourceConfiguration, Error> {
  try {
    const validated = dataSourceConfigurationSchema.parse(config);
    return new Ok(validated);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

// Create minimal objects with placeholder values that will be populated by the server
export function createMinimalDataSourceView(sId: string): DataSourceViewType {
  return {
    sId,
    id: 0 as ModelId,
    category: "managed" as DataSourceViewCategory,
    createdAt: 0,
    updatedAt: 0,
    spaceId: "",
    kind: "default",
    parentsIn: null,
    dataSource: {} as DataSourceType,
  };
}

export function createMinimalDataSourceViewContentNodes(
  parentIds: string[]
): DataSourceViewContentNode[] {
  return parentIds.map((internalId) => ({
    internalId,
    dataSourceView: createMinimalDataSourceView(""),
  })) as DataSourceViewContentNode[];
}
