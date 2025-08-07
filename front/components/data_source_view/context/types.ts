import { z } from "zod";

import type {
  DataSourceViewCategoryWithoutApps,
  DataSourceViewContentNode,
  DataSourceViewType,
  SpaceType,
} from "@app/types";

const navigationHistoryEntry = z.discriminatedUnion("type", [
  z.object({ type: z.literal("root") }),
  z.object({ type: z.literal("space"), space: z.custom<SpaceType>() }),
  z.object({
    type: z.literal("category"),
    category: z.custom<DataSourceViewCategoryWithoutApps>(),
  }),
  z.object({
    type: z.literal("data_source"),
    dataSourceView: z.custom<DataSourceViewType>(),
  }),
  z.object({
    type: z.literal("node"),
    node: z.custom<DataSourceViewContentNode>(),
  }),
]);

const dataSourceBuilderTreeItemType = z
  .object({
    name: z.string(),
    path: z.string(),
  })
  .and(navigationHistoryEntry);
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

export type NavigationHistoryEntryType = z.infer<typeof navigationHistoryEntry>;

export type NodeSelectionState = boolean | "partial";
