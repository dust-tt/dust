// Redis fast-path cache for per-API-key credit-state-driven access control.
//
// Mirrors `user_block.ts` but for API keys: the key
// `metronome:api_key_credit_state:<ws>:<keyModelId>` holds the per-key credit state
// (mirrors `keys.creditState`). "capped" means the key is blocked because it
// hit its admin-configured per-key spend cap. The DB column remains the source
// of truth; cache writes are gated on DB transaction commit via
// `invalidateCacheAfterCommit`, and cache misses fall back to DB and
// repopulate the key.
import { runOnRedis } from "@app/lib/api/redis";
import { KeyResource } from "@app/lib/resources/key_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { ApiKeyCreditState } from "@app/types/key";
import { isApiKeyCreditState } from "@app/types/key";
import type { ModelId } from "@app/types/shared/model_id";

const REDIS_ORIGIN = "metronome_limit" as const;

function buildApiKeyCreditStateKey(
  workspaceId: string,
  keyModelId: ModelId
): string {
  return `metronome:api_key_credit_state:${workspaceId}:${keyModelId}`;
}

export async function setApiKeyCreditState(
  workspaceId: string,
  keyModelId: ModelId,
  state: ApiKeyCreditState
): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
    await client.set(buildApiKeyCreditStateKey(workspaceId, keyModelId), state);
  });
}

async function getApiKeyCreditState(
  workspaceId: string,
  keyModelId: ModelId
): Promise<ApiKeyCreditState> {
  const cached = await runOnRedis({ origin: REDIS_ORIGIN }, async (client) =>
    client.get(buildApiKeyCreditStateKey(workspaceId, keyModelId))
  );

  if (cached && isApiKeyCreditState(cached)) {
    return cached;
  }

  logger.info(
    { workspaceId, keyModelId, apiKeyCreditStateCacheHit: false },
    "[MetronomeApiKeyBlock] Cache miss during API key credit state check, falling back to DB"
  );

  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    logger.warn(
      { workspaceId, keyModelId },
      "[MetronomeApiKeyBlock] Workspace not found during API key credit state cache read-through fallback"
    );
    return "on_pool";
  }

  const key = await KeyResource.fetchByWorkspaceAndId({
    workspace: renderLightWorkspaceType({ workspace }),
    id: keyModelId,
  });

  const state: ApiKeyCreditState =
    key && isApiKeyCreditState(key.creditState) ? key.creditState : "on_pool";

  await setApiKeyCreditState(workspaceId, keyModelId, state);
  return state;
}

export async function isApiKeyCappedByMetronome(
  workspaceId: string,
  keyModelId: ModelId
): Promise<boolean> {
  // getApiKeyCreditState has its own DB fallback and cache repopulation.
  const state = await getApiKeyCreditState(workspaceId, keyModelId);
  return state === "capped";
}
