import type { DfsObjectId } from "@app/types/dfs";
import { v7 as uuidv7 } from "uuid";

/**
 * A fresh UUIDv7 object id in the dfs hex form (no dashes), as `create` operations require the
 * caller to supply one.
 */
export function newDfsObjectId(): DfsObjectId {
  return uuidv7().replace(/-/g, "");
}
