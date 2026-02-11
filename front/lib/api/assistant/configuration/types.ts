import type { Order } from "sequelize";

import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { TagsFilter } from "@app/types/data_source_view";

export type DataSourceFilter = {
  parents: { in: string[] | null; not: string[] | null } | null;
  tags: TagsFilter;
};

export type DataSourceConfiguration = {
  sId?: string; // The sId is not always available, for instance it is not in an unsaved state of the builder.
  workspaceId: string;
  dataSourceViewId: string;
  filter: DataSourceFilter;
};

export type TableDataSourceConfiguration = {
  sId?: string; // The sId is not always available, for instance it is not in an unsaved state of the builder.
  workspaceId: string;
  dataSourceViewId: string;
  tableId: string;
};

export type ProjectConfiguration = {
  workspaceId: string; // The sId of the workspace (organization)
  projectId: string; // The sId of the project (space)
};

export type SortStrategyType = "alphabetical" | "priority" | "updatedAt";

export interface SortStrategy {
  dbOrder: Order | undefined;
  compareFunction: (
    a: AgentConfigurationType,
    b: AgentConfigurationType
  ) => number;
}
