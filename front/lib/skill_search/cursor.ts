import { getRedisCacheClient } from "@app/lib/api/redis";
import {
  SKILL_SEARCH_KEEP_ALIVE_SECONDS,
  SkillSearchSortSchema,
} from "@app/lib/skill_search/search";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import { createHash, randomUUID } from "crypto";
import { z } from "zod";

const CursorSchema = z.object({
  pitId: z.string(),
  searchAfter: SkillSearchSortSchema.nullable(),
  globalOffset: z.number().int().nonnegative(),
  customExhausted: z.boolean(),
});
export type SkillSearchCursor = z.infer<typeof CursorSchema>;

export class SkillSearchCursorError extends Error {
  constructor() {
    super("Invalid or expired skill search cursor. Restart the search.");
  }
}

export function getSkillSearchFingerprint(context: unknown): string {
  return createHash("sha256").update(JSON.stringify(context)).digest("hex");
}

// Opaque, immutable cursors avoid exposing names, ACLs or PIT details in URLs.
// Binding the key to the caller/query/catalog also makes cursor replay across
// workspaces or a changed catalog fail closed. A retry never consumes a cursor.
export async function readSkillSearchCursor(
  fingerprint: string,
  cursor: string
): Promise<SkillSearchCursor | null> {
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

export async function writeSkillSearchCursor(
  fingerprint: string,
  state: SkillSearchCursor
): Promise<string> {
  const cursor = randomUUID();
  const redis = await getRedisCacheClient({ origin: "skill_search_cursor" });
  await redis.set(
    `skill_search_cursor:${fingerprint}:${cursor}`,
    JSON.stringify(state),
    { EX: SKILL_SEARCH_KEEP_ALIVE_SECONDS }
  );
  return cursor;
}
