import * as t from "io-ts";

import { DataSourceType } from "../../data_source";
import { DataSourceViewType } from "../../data_source_view";

export const ContentSchema = t.type({
  dataSource: t.string,
  parentsIn: t.array(t.string),
});

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

export type DataSourceCategory = "managed" | "files" | "webfolder" | "apps";

export type DataSourceInfo = Partial<DataSourceType> &
  Partial<DataSourceViewType> & {
    usage: number;
    category: DataSourceCategory;
  };
