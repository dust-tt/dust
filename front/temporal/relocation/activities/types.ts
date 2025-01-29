import { RegionType } from "@app/lib/api/regions/config";

import { ModelId } from "@dust-tt/types";

export interface RelocationBlob<T extends string = string> {
  statements: Record<T, string[]>;
}

export type CoreEntitiesRelocationBlob = RelocationBlob<
  "plans" | "users_metadata" | "users" | "workspace"
>;

export interface ReadTableChunkParams {
  destRegion: RegionType;
  lastId?: ModelId;
  limit: number;
  sourceRegion: RegionType;
  tableName: string;
  workspaceId: string;
}
