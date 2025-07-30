import type { JSONSchema7 as JSONSchema } from "json-schema";

import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import {
  isExtractDataAction,
  isIncludeDataAction,
  isSearchAction,
} from "@app/components/agent_builder/types";
import type { DataSourceBuilderTreeType } from "@app/components/data_source_view/context/types";
import { transformSelectionConfigurationsToTree } from "@app/components/agent_builder/capabilities/knowledge/transformations";
import type {
  DataSourceViewSelectionConfigurations,
  TimeFrame,
} from "@app/types";

export function getDataSourceConfigurations(
  action?: AgentBuilderAction
): DataSourceViewSelectionConfigurations {
  if (!action) {
    return {};
  }

  if (
    isSearchAction(action) ||
    isIncludeDataAction(action) ||
    isExtractDataAction(action)
  ) {
    return action.configuration.dataSourceConfigurations;
  }

  return {};
}

export function getTimeFrame(action?: AgentBuilderAction): TimeFrame | null {
  if (!action) {
    return null;
  }

  if (isIncludeDataAction(action) || isExtractDataAction(action)) {
    return action.configuration.timeFrame;
  }

  return null;
}

export function getJsonSchema(action?: AgentBuilderAction): JSONSchema | null {
  if (!action) {
    return null;
  }

  if (isExtractDataAction(action)) {
    return action.configuration.jsonSchema;
  }

  return null;
}

export function isValidPage<T extends Record<string, string>>(
  pageId: string,
  pageIds: T
): pageId is T[keyof T] {
  return Object.values(pageIds).includes(pageId);
}

export function getDataSourceTree(
  action?: AgentBuilderAction
): DataSourceBuilderTreeType {
  const configurations = getDataSourceConfigurations(action);
  return transformSelectionConfigurationsToTree(configurations);
}
