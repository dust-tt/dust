import * as t from "io-ts";

import { ContentNodeType } from "../../lib/connectors_api";

export const ContentSchema = t.type({
  dataSourceId: t.string,
  parentsIn: t.array(t.string),
});

export const PostDataSourceViewSchema = t.type({
  dataSourceId: t.string,
  parentsIn: t.array(t.string),
});

export type PostDataSourceViewType = t.TypeOf<typeof PostDataSourceViewSchema>;

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

export const PostVaultRequestBodySchema = t.type({
  name: t.string,
  memberIds: t.union([t.array(t.string), t.undefined]),
});

export type PostVaultRequestBodyType = t.TypeOf<
  typeof PostVaultRequestBodySchema
>;

export const PatchVaultRequestBodySchema = t.type({
  name: t.union([t.string, t.undefined]),
  memberIds: t.union([t.array(t.string), t.undefined]),
  content: t.union([t.array(ContentSchema), t.undefined]),
});

export type PatchVaultRequestBodyType = t.TypeOf<
  typeof PatchVaultRequestBodySchema
>;

export type LightContentNode = {
  dustDocumentId: string | null;
  expandable: boolean;
  internalId: string;
  lastUpdatedAt: number | null;
  parentInternalId: string | null;
  preventSelection?: boolean;
  sourceUrl: string | null;
  title: string;
  titleWithParentsContext?: string;
  type: ContentNodeType;
};

export type GetDataSourceViewContentResponseBody = {
  nodes: LightContentNode[];
};

export const DATA_SOURCE_VIEW_CATEGORIES = [
  "managed",
  "folder",
  "website",
  "apps",
] as const;

export type DataSourceViewCategory =
  (typeof DATA_SOURCE_VIEW_CATEGORIES)[number];

export function isWebsiteOrFolderCategory(
  category: unknown
): category is Extract<DataSourceViewCategory, "website" | "folder"> {
  return category === "website" || category === "folder";
}
