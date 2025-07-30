import { z } from "zod";

import type {
  DataSourceViewCategoryWithoutApps,
  DataSourceViewContentNode,
  SpaceType,
} from "@app/types";

export const dataSourceBuilderTreeType = z.object({
  in: z.string().array(),
  notIn: z.string().array(),
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
