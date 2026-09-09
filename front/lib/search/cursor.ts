import { getRedisCacheClient } from "@app/lib/api/redis";
import {
  RESOURCE_SEARCH_KEEP_ALIVE_SECONDS,
  ResourceSearchSortSchema,
} from "@app/lib/search/resource_query";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import { createHash, randomUUID } from "crypto";
import { z } from "zod";

const CursorSchema = z.object({
  pitId: z.string(),
  searchAfter: ResourceSearchSortSchema.nullable(),
  globalOffset: z.number().int().nonnegative(),
  customExhausted: z.boolean(),
});
export type ResourceSearchCursor = z.infer<typeof CursorSchema>;

export class ResourceSearchCursorError extends Error {
  constructor() {
    super("Invalid or expired resource search cursor. Restart the search.");
  }
}

export function getResourceSearchFingerprint(context: unknown): string {
  return createHash("sha256").update(JSON.stringify(context)).digest("hex");
}

// Opaque, immutable cursors avoid exposing names, ACLs or PIT details in URLs.
// Binding the key to the caller/query/catalog also makes cursor replay across
// workspaces or a changed catalog fail closed. A retry never consumes a cursor.
export async function readResourceSearchCursor(
  fingerprint: string,
  cursor: string
): Promise<ResourceSearchCursor | null> {
  const redis = await getRedisCacheClient({ origin: "skill_search_cursor" });
  const raw = await redis.get(`skill_search_cursor:${fingerprint}:${cursor}`);
  if (!raw) {
    return null;
  }
  const json = safeParseJSON(raw);
  if (json.isErr()) {
    return null;
  }
  const parsed = CursorSchema.safeParse(json.value);
  return parsed.success ? parsed.data : null;
}

export async function writeResourceSearchCursor(
  fingerprint: string,
  state: ResourceSearchCursor
): Promise<string> {
  const cursor = randomUUID();
  const redis = await getRedisCacheClient({ origin: "skill_search_cursor" });
  await redis.set(
    `skill_search_cursor:${fingerprint}:${cursor}`,
    JSON.stringify(state),
    { EX: RESOURCE_SEARCH_KEEP_ALIVE_SECONDS }
  );
  return cursor;
}
