import { z } from "zod";

import type {
  DataSourceViewCategoryWithoutApps,
  DataSourceViewContentNode,
  SpaceType,
} from "@app/types";

const dataSourceBuilderTreeItemType = z.object({
  name: z.string(),
  path: z.string(),
  node: z.custom<DataSourceViewContentNode>().optional(),
});
export type DataSourceBuilderTreeItemType = z.infer<
  typeof dataSourceBuilderTreeItemType
>;

export const dataSourceBuilderTreeType = z.object({
  in: dataSourceBuilderTreeItemType.array(),
  notIn: dataSourceBuilderTreeItemType.array(),
});
export type DataSourceBuilderTreeType = z.infer<
  typeof dataSourceBuilderTreeType
>;

export type NavigationHistoryEntryType =
  | { type: "root" }
  | { type: "space"; space: SpaceType }
  | { type: "category"; category: DataSourceViewCategoryWithoutApps }
  | { type: "node"; node: DataSourceViewContentNode };

export type NodeSelectionState = boolean | "partial";
