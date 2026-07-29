import { getRedisCacheClient } from "@app/lib/api/redis";
import logger from "@app/logger/logger";
import type { AgentContentItemType } from "@app/types/assistant/agent_message_content";
import type { ModelId } from "@app/types/shared/model_id";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import groupBy from "lodash/groupBy";

export const AGENT_STEP_CONTENT_CACHE_TTL_MS = 15 * 60 * 1000;

// Bump the `:v1` suffix any time the cached value shape changes, so stale entries
// from previous formats are orphaned instead of mis-parsed.
export function agentStepContentCacheKey({
  workspaceId,
  agentMessageId,
}: {
  workspaceId: ModelId;
  agentMessageId: ModelId;
}): string {
  return `agent_step_contents:w:${workspaceId}:am:${agentMessageId}:v1`;
}

export function agentStepContentHashField({
  step,
  index,
}: {
  step: number;
  index: number;
}): string {
  return `${step}:${index}`;
}

export type CachedAgentStepContent = {
  id: ModelId;
  workspaceId: ModelId;
  agentMessageId: ModelId;
  step: number;
  index: number;
  version: number;
  type: AgentContentItemType["type"];
  value: AgentContentItemType;
  createdAt: string;
  updatedAt: string;
};

export type AgentStepContentCacheMetadata = {
  id: ModelId;
  agentMessageId: ModelId;
  step: number;
  index: number;
  version: number;
  type: AgentContentItemType["type"];
};

/**
 * Write-through warm after create (or after a cache-miss PG fetch). Best-effort:
 * failures are logged and ignored so Redis never blocks the agent loop.
 */
export async function warmAgentStepContentCache(
  content: CachedAgentStepContent
): Promise<void> {
  try {
    const redis = await getRedisCacheClient({
      origin: "agent_step_content_cache",
    });
    const key = agentStepContentCacheKey({
      workspaceId: content.workspaceId,
      agentMessageId: content.agentMessageId,
    });
    const field = agentStepContentHashField({
      step: content.step,
      index: content.index,
    });

    const multi = redis.multi();
    multi.hSet(key, field, JSON.stringify(content));
    multi.pExpire(key, AGENT_STEP_CONTENT_CACHE_TTL_MS);
    await multi.exec();
  } catch (err) {
    logger.warn(
      {
        err: normalizeError(err),
        agentMessageId: content.agentMessageId,
        step: content.step,
        index: content.index,
      },
      "Failed to warm agent step content cache"
    );
  }
}

export async function warmAgentStepContentCacheMany(
  contents: CachedAgentStepContent[]
): Promise<void> {
  await Promise.all(contents.map((c) => warmAgentStepContentCache(c)));
}

function isCachedAgentStepContent(
  value: unknown
): value is CachedAgentStepContent {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "number" &&
    typeof v.workspaceId === "number" &&
    typeof v.agentMessageId === "number" &&
    typeof v.step === "number" &&
    typeof v.index === "number" &&
    typeof v.version === "number" &&
    typeof v.type === "string" &&
    v.value !== null &&
    typeof v.value === "object" &&
    typeof v.createdAt === "string" &&
    typeof v.updatedAt === "string"
  );
}

/**
 * Given latest-version metadata from PG (no `value` column), try to hydrate
 * full rows from the per-agentMessage Redis Hash. A message is a hit only when
 * every expected `(step, index)` field is present and matches `id` + `version`.
 *
 * Returns null if Redis itself fails — caller should treat all ids as misses.
 */
export async function tryHydrateAgentStepContentsFromCache({
  workspaceId,
  agentMessageIds,
  latestMetadata,
}: {
  workspaceId: ModelId;
  agentMessageIds: ModelId[];
  latestMetadata: AgentStepContentCacheMetadata[];
}): Promise<{
  hitsByAgentMessageId: Map<ModelId, CachedAgentStepContent[]>;
  missAgentMessageIds: ModelId[];
} | null> {
  const uniqueIds = [...new Set(agentMessageIds)];
  if (uniqueIds.length === 0) {
    return { hitsByAgentMessageId: new Map(), missAgentMessageIds: [] };
  }

  const expectedByMessage = groupBy(latestMetadata, (m) => m.agentMessageId);

  try {
    const redis = await getRedisCacheClient({
      origin: "agent_step_content_cache",
    });

    const multi = redis.multi();
    for (const agentMessageId of uniqueIds) {
      multi.hGetAll(agentStepContentCacheKey({ workspaceId, agentMessageId }));
    }
    const results = await multi.exec();

    const hitsByAgentMessageId = new Map<ModelId, CachedAgentStepContent[]>();
    const missAgentMessageIds: ModelId[] = [];

    for (let i = 0; i < uniqueIds.length; i++) {
      const agentMessageId = uniqueIds[i];
      const expected = expectedByMessage[agentMessageId] ?? [];
      const hash = results[i] as Record<string, string> | null | undefined;

      if (expected.length === 0) {
        hitsByAgentMessageId.set(agentMessageId, []);
        continue;
      }

      if (!hash || Object.keys(hash).length === 0) {
        missAgentMessageIds.push(agentMessageId);
        continue;
      }

      const hydrated: CachedAgentStepContent[] = [];
      let complete = true;

      for (const meta of expected) {
        const field = agentStepContentHashField({
          step: meta.step,
          index: meta.index,
        });
        const raw = hash[field];
        if (!raw) {
          complete = false;
          break;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          complete = false;
          break;
        }

        if (
          !isCachedAgentStepContent(parsed) ||
          parsed.id !== meta.id ||
          parsed.version !== meta.version ||
          parsed.agentMessageId !== meta.agentMessageId
        ) {
          complete = false;
          break;
        }

        hydrated.push(parsed);
      }

      if (complete) {
        hitsByAgentMessageId.set(agentMessageId, hydrated);
      } else {
        missAgentMessageIds.push(agentMessageId);
      }
    }

    return { hitsByAgentMessageId, missAgentMessageIds };
  } catch (err) {
    logger.warn(
      {
        err: normalizeError(err),
        workspaceId,
        agentMessageCount: uniqueIds.length,
      },
      "Failed to read agent step content cache; falling back to Postgres"
    );
    return null;
  }
}

export function toCachedAgentStepContent(blob: {
  id: ModelId;
  workspaceId: ModelId;
  agentMessageId: ModelId;
  step: number;
  index: number;
  version: number;
  type: AgentContentItemType["type"];
  value: AgentContentItemType;
  createdAt: Date;
  updatedAt: Date;
}): CachedAgentStepContent {
  return {
    id: blob.id,
    workspaceId: blob.workspaceId,
    agentMessageId: blob.agentMessageId,
    step: blob.step,
    index: blob.index,
    version: blob.version,
    type: blob.type,
    value: blob.value,
    createdAt: blob.createdAt.toISOString(),
    updatedAt: blob.updatedAt.toISOString(),
  };
}
