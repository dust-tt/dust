import * as t from "io-ts";

import { ContentNodeType } from "../../lib/connectors_api";

export const ContentSchema = t.type({
  dataSource: t.string,
  parentsIn: t.union([t.array(t.string), t.null]),
});

export const PostDataSourceViewSchema = t.type({
  name: t.string,
  parentsIn: t.union([t.array(t.string), t.null]),
});

export type PostDataSourceViewType = t.TypeOf<typeof PostDataSourceViewSchema>;

export const PatchDataSourceViewSchema = t.type({
  parentsIn: t.union([t.array(t.string), t.null]),
});

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
  memberIds: t.union([t.array(t.string), t.undefined]),
  content: t.union([t.array(ContentSchema), t.undefined]),
});

export type PatchVaultRequestBodyType = t.TypeOf<
  typeof PatchVaultRequestBodySchema
>;

export type LightContentNode = {
  internalId: string;
  parentInternalId: string | null;
  type: ContentNodeType;
  title: string;
  expandable: boolean;
  preventSelection?: boolean;
  dustDocumentId: string | null;
  lastUpdatedAt: number | null;
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

export function isDataSourceViewCategory(
  category: string
): category is DataSourceViewCategory {
  return DATA_SOURCE_VIEW_CATEGORIES.includes(
    category as DataSourceViewCategory
  );
}
