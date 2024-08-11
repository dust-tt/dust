import * as t from "io-ts";

import { ConnectorProvider, EditedByUser } from "../../data_source";

export const ContentSchema = t.type({
  dataSource: t.string,
  parentsIn: t.array(t.string),
});

export const PostDataSourceViewSchema = t.type({
  name: t.string,
  parentsIn: t.array(t.string),
});

export type PostDataSourceViewType = t.TypeOf<typeof PostDataSourceViewSchema>;

export const PatchDataSourceViewSchema = t.type({
  parentsIn: t.array(t.string),
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

export type ResourceCategory = "managed" | "files" | "webfolder" | "apps";

export type ResourceInfo = {
  createdAt: number;
  sId: string;
  parentsIn?: string[] | null;
  connectorId?: string | null;
  connectorProvider?: ConnectorProvider | null;
  editedByUser?: EditedByUser | null;
  category: ResourceCategory;
  usage: number;
};
