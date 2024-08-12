import * as t from "io-ts";

import { ConnectorProvider, EditedByUser } from "../../data_source";
import { ContentNodeType } from "../../lib/connectors_api";

export const ContentSchema = t.type({
  dataSource: t.string,
  parentsIn: t.array(t.string),
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
  members: t.union([t.array(t.string), t.undefined]),
  content: t.union([t.array(ContentSchema), t.undefined]),
});

export type PostVaultRequestBodyType = t.TypeOf<
  typeof PostVaultRequestBodySchema
>;

export const PatchVaultRequestBodySchema = t.type({
  members: t.union([t.array(t.string), t.undefined]),
  content: t.union([t.array(ContentSchema), t.undefined]),
});

export type PatchVaultRequestBodyType = t.TypeOf<
  typeof PostVaultRequestBodySchema
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

export type GetDataSourceOrViewContentResponseBody = {
  nodes: LightContentNode[];
};

export const DATA_SOURCE_OR_VIEW_CATEGORIES = [
  "managed",
  "files",
  "webfolder",
  "apps",
] as const;

export type DataSourceOrViewCategory =
  (typeof DATA_SOURCE_OR_VIEW_CATEGORIES)[number];

export type DataSourceOrViewInfo = {
  createdAt: number;
  sId: string;
  name: string;
  parentsIn?: string[] | null;
  connectorId?: string | null;
  connectorProvider?: ConnectorProvider | null;
  editedByUser?: EditedByUser | null;
  category: DataSourceOrViewCategory;
  usage: number;
};
