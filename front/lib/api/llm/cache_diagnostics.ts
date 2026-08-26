import { runOnRedisCache } from "@app/lib/api/redis";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// Anthropic prompt-cache diagnostics need the previous response id to compare
// consecutive requests. We stash it in Redis (not a Temporal workflow variable,
// which dies with the workflow, nor the DB, which outlives the data's usefulness)
// keyed by conversation and agent so the chain survives across agent-loop steps
// and across user turns (each turn is a fresh workflow). The short TTL matches
// the lifetime of Anthropic's diagnostics fingerprint and the prompt cache
// itself: once it expires, the previous id is worthless anyway, so we stop
// sending it and the key cleans itself up.
const CACHE_DIAGNOSTICS_TTL_SECONDS = 600;

export interface CacheDiagnosticsKey {
  conversationId: string;
  agentConfigurationId: string;
  providerId: string;
}

function makeCacheDiagnosticsKey({
  agentConfigurationId,
  conversationId,
  providerId,
}: CacheDiagnosticsKey): string {
  // Include the agent so concurrent agents answering in the same conversation
  // (multiple mentions) keep independent chains instead of clobbering each other.
  // Include the provider so a mid-conversation provider switch starts a fresh
  // chain instead of sending another provider's response id. The model is not
  // needed: Providers already detect model changes across consecutive requests.
  return `cache_diagnostics:${conversationId}:${agentConfigurationId}:${providerId}`;
}

// Returns the previous LLM call's response id for this conversation and agent,
// or `null` when there is none yet (or it has expired). `null` is meaningful: it
// is the opt-in-without-prior value Anthropic expects on the first call.
//
// Diagnostics is pure observability, so a Redis failure must never break
// generation: on error we log and behave as if there were no prior id.
export async function getPreviousMessageId(
  key: CacheDiagnosticsKey
): Promise<string | null> {
  try {
    return await runOnRedisCache({ origin: "cache_diagnostics" }, (client) =>
      client.get(makeCacheDiagnosticsKey(key))
    );
  } catch (err) {
    logger.warn(
      { err: normalizeError(err), ...key },
      "[cache diagnostics] failed to read previous message id"
    );
    return null;
  }
}

// Stores this call's response id so the next step or turn can compare against it.
// Best-effort: a Redis failure is logged and swallowed so it cannot break the
// agent loop.
export async function setPreviousMessageId(
  key: CacheDiagnosticsKey,
  modelInteractionId: string
): Promise<void> {
  try {
    await runOnRedisCache({ origin: "cache_diagnostics" }, (client) =>
      client.set(makeCacheDiagnosticsKey(key), modelInteractionId, {
        EX: CACHE_DIAGNOSTICS_TTL_SECONDS,
      })
    );
  } catch (err) {
    logger.warn(
      { err: normalizeError(err), ...key },
      "[cache diagnostics] failed to store previous message id"
    );
  }
}
