import type { Order } from "sequelize";

import type { AgentConfigurationType, TagsFilter } from "@app/types";

export type DataSourceFilter = {
  parents: { in: string[] | null; not: string[] | null } | null;
  tags?: TagsFilter;
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

export type SortStrategyType = "alphabetical" | "priority" | "updatedAt";

export interface SortStrategy {
  dbOrder: Order | undefined;
  compareFunction: (
    a: AgentConfigurationType,
    b: AgentConfigurationType
  ) => number;
}
