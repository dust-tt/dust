import { RegionType } from "@app/lib/api/regions/config";

import { CoreAPIDocumentBlob, ModelId } from "@dust-tt/types";

export interface RelocationBlob<T extends string = string> {
  statements: Record<T, string[]>;
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

export const CORE_API_CONCURRENCY_LIMIT = 10;
export const CORE_API_LIST_NODES_BATCH_SIZE = 100;

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
