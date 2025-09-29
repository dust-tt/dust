import * as t from "io-ts";

import type { ContentNodeType } from "../../core/content_node";

const ParentsToAddRemoveSchema = t.type({
  parentsToAdd: t.union([t.array(t.string), t.undefined]),
  parentsToRemove: t.union([t.array(t.string), t.undefined]),
});

const ParentsInSchema = t.type({
  parentsIn: t.array(t.string),
});

export const PatchDataSourceViewSchema = t.union([
  ParentsToAddRemoveSchema,
  ParentsInSchema,
]);

export type PatchDataSourceViewType = t.TypeOf<
  typeof PatchDataSourceViewSchema
>;

export type LightContentNode = {
  expandable: boolean;
  internalId: string;
  lastUpdatedAt: number | null;
  parentInternalId: string | null;
  preventSelection?: boolean;
  sourceUrl: string | null;
  title: string;
  type: ContentNodeType;
};

export const DATA_SOURCE_VIEW_CATEGORIES = [
  "managed",
  "folder",
  "website",
  "apps",
  "actions",
  "triggers",
] as const;

export type DataSourceViewCategory =
  (typeof DATA_SOURCE_VIEW_CATEGORIES)[number];

function isValidDataSourceViewCategory(
  category: unknown
): category is DataSourceViewCategory {
  return DATA_SOURCE_VIEW_CATEGORIES.includes(
    category as DataSourceViewCategory
  );
}

export type DataSourceViewCategoryWithoutApps = Exclude<
  DataSourceViewCategory,
  "apps" | "actions"
>;

export function isDataSourceViewCategoryWithoutApps(
  category: unknown
): category is DataSourceViewCategoryWithoutApps {
  return (
    isValidDataSourceViewCategory(category) &&
    category !== "apps" &&
    category !== "actions"
  );
}

export function isWebsiteOrFolderCategory(
  category: unknown
): category is Extract<DataSourceViewCategory, "website" | "folder"> {
  return category === "website" || category === "folder";
}
