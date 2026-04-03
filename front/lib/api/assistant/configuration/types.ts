import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { TagsFilterSchema } from "@app/types/data_source_view";
import type { Order } from "sequelize";
import { z } from "zod";

export const DataSourceFilterSchema = z.object({
  parents: z
    .object({
      in: z.array(z.string()).nullable(),
      not: z.array(z.string()).nullable(),
    })
    .nullable(),
  tags: TagsFilterSchema,
});

export type DataSourceFilter = z.infer<typeof DataSourceFilterSchema>;

export const DataSourceConfigurationSchema = z.object({
  sId: z.string().optional(), // The sId is not always available, for instance it is not in an unsaved state of the builder.
  workspaceId: z.string(),
  dataSourceViewId: z.string(),
  filter: DataSourceFilterSchema,
});

export type DataSourceConfiguration = z.infer<
  typeof DataSourceConfigurationSchema
>;

export const TableDataSourceConfigurationSchema = z.object({
  sId: z.string().optional(), // The sId is not always available, for instance it is not in an unsaved state of the builder.
  workspaceId: z.string(),
  dataSourceViewId: z.string(),
  tableId: z.string(),
});

export type TableDataSourceConfiguration = z.infer<
  typeof TableDataSourceConfigurationSchema
>;

export const ProjectConfigurationSchema = z.object({
  workspaceId: z.string(), // The sId of the workspace (organization)
  projectId: z.string(), // The sId of the project (space)
});

export type ProjectConfiguration = z.infer<typeof ProjectConfigurationSchema>;

export type SortStrategyType = "alphabetical" | "priority" | "updatedAt";

export interface SortStrategy {
  dbOrder: Order | undefined;
  compareFunction: (
    a: AgentConfigurationType,
    b: AgentConfigurationType
  ) => number;
}
