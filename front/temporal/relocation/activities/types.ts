import { isPlainObject } from "lodash";

import type { RegionType } from "@app/lib/api/regions/config";
import type {
  CoreAPIContentNode,
  CoreAPIDocumentBlob,
  CoreAPITableBlob,
  ModelId,
} from "@app/types";

export interface RelocationBlob<T extends string = string> {
  statements: Record<T, { sql: string; params: any[] }[]>;
}

export type CoreEntitiesRelocationBlob = RelocationBlob<
  "plans" | "user_metadata" | "users" | "workspace"
>;

export interface ReadTableChunkParams {
  destRegion: RegionType;
  lastId?: ModelId;
  limit: number;
  sourceRegion: RegionType;
  tableName: string;
  workspaceId: string;
}

export const CORE_API_CONCURRENCY_LIMIT = 32;
export const CORE_API_LIST_NODES_BATCH_SIZE = 96;

// Core.

export interface DataSourceCoreIds {
  id: ModelId;
  dustAPIProjectId: string;
  dustAPIDataSourceId: string;
}

export interface CreateDataSourceProjectResult {
  dustAPIProjectId: string;
  dustAPIDataSourceId: string;
}

export interface APIRelocationBlob<
  T extends string = string,
  V extends object = object,
> {
  blobs: Record<T, V[]>;
}

export type CoreDocumentAPIRelocationBlob = APIRelocationBlob<
  "documents",
  CoreAPIDocumentBlob
>;

export type CoreFolderAPIRelocationBlob = APIRelocationBlob<
  "folders",
  CoreAPIContentNode
>;

export type CoreTableAPIRelocationBlob = APIRelocationBlob<
  "tables",
  CoreAPITableBlob
>;

export function isArrayOfPlainObjects(value: unknown) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((element) => isPlainObject(element))
  );
}
