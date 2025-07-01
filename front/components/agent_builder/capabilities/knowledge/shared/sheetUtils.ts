import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import {
  isIncludeDataAction,
  isSearchAction,
} from "@app/components/agent_builder/types";
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

  if (isSearchAction(action) || isIncludeDataAction(action)) {
    return action.configuration.dataSourceConfigurations;
  }

  return {};
}

export function getTimeFrame(action?: AgentBuilderAction): TimeFrame | null {
  if (!action) {
    return null;
  }

  if (isIncludeDataAction(action)) {
    return action.configuration.timeFrame;
  }

  return null;
}

export function hasDataSourceSelections(
  dataSourceConfigurations: DataSourceViewSelectionConfigurations
): boolean {
  return Object.keys(dataSourceConfigurations).length > 0;
}

export function isValidPage<T extends Record<string, string>>(
  pageId: string,
  pageIds: T
): pageId is T[keyof T] {
  return Object.values(pageIds).includes(pageId);
}
