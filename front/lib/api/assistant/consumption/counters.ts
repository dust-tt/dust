import {
  CONSUMPTION_KEY_TTL_MS,
  CONSUMPTION_ROOT_SUBAGENTS_FIELD,
  CONSUMPTION_ROOT_TOTAL_FIELD,
  makeConsumptionRootAgentMessageField,
  makeConsumptionRootKey,
  makeConsumptionRootSubagentField,
} from "@app/lib/api/assistant/consumption/keys";
import { runOnRedisCache } from "@app/lib/api/redis";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import assert from "assert";

const ROOT_HASH_WRITE_METRIC = "consumption.root_hash_write.count";
const REDIS_ERROR_METRIC = "ratelimiter.error.count";

/**
 * Atomically replaces one agent message total within its root hash.
 *
 * KEYS:
 * - KEYS[1]: Root consumption hash key.
 *
 * ARGV:
 * - ARGV[1]: Agent message total field (`m:<agentMessageId>`).
 * - ARGV[2]: Replacement agent message total in microcredits.
 * - ARGV[3]: Root total field.
 * - ARGV[4]: Root subagent count field.
 * - ARGV[5]: Subagent marker field (`a:<agentMessageId>`), or empty for the root agent.
 * - ARGV[6]: Hash TTL in milliseconds.
 */
const RECORD_AGENT_MESSAGE_TOTAL_SCRIPT = `
local previous = tonumber(redis.call("HGET", KEYS[1], ARGV[1]) or "0")
local current = tonumber(ARGV[2])

redis.call("HSET", KEYS[1], ARGV[1], ARGV[2])
redis.call("HINCRBY", KEYS[1], ARGV[3], current - previous)

if ARGV[5] ~= "" and redis.call("HSETNX", KEYS[1], ARGV[5], "1") == 1 then
  redis.call("HINCRBY", KEYS[1], ARGV[4], 1)
end

redis.call("PEXPIRE", KEYS[1], ARGV[6])
`;

function reportRedisError({
  operation,
  error,
  context,
}: {
  operation: "write_consumption_root";
  error: unknown;
  context: Record<string, unknown>;
}): void {
  statsDMetrics.increment(REDIS_ERROR_METRIC, 1, [`operation:${operation}`]);
  logger.error(
    { ...context, operation, error },
    "Consumption root Redis operation failed"
  );
}

/**
 * @cc [owner:id13,label:backend;concurrency;error-handling] consumption-root-shadow-write
 * A call MUST atomically replace one agent message total, adjust the root total by its delta, and
 * count a non-root agent message once. Redis failures MUST be reported without failing the caller.
 */
export async function recordAgentMessageTotal({
  workspaceId,
  rootAgentMessageId,
  agentMessageId,
  totalCreditAmountMicro,
}: {
  workspaceId: string;
  rootAgentMessageId: ModelId;
  agentMessageId: ModelId;
  totalCreditAmountMicro: number;
}): Promise<void> {
  assert(
    Number.isSafeInteger(totalCreditAmountMicro) && totalCreditAmountMicro >= 0,
    "Consumption agent message total must be a non-negative integer"
  );

  const isSubagent = agentMessageId !== rootAgentMessageId;
  try {
    await runOnRedisCache({ origin: "consumption" }, async (redis) => {
      await redis.eval(RECORD_AGENT_MESSAGE_TOTAL_SCRIPT, {
        keys: [makeConsumptionRootKey({ workspaceId, rootAgentMessageId })],
        arguments: [
          makeConsumptionRootAgentMessageField(agentMessageId),
          totalCreditAmountMicro.toString(),
          CONSUMPTION_ROOT_TOTAL_FIELD,
          CONSUMPTION_ROOT_SUBAGENTS_FIELD,
          isSubagent ? makeConsumptionRootSubagentField(agentMessageId) : "",
          CONSUMPTION_KEY_TTL_MS.toString(),
        ],
      });
    });
    statsDMetrics.increment(ROOT_HASH_WRITE_METRIC, 1, [
      "status:success",
      `is_subagent:${isSubagent}`,
    ]);
  } catch (error) {
    statsDMetrics.increment(ROOT_HASH_WRITE_METRIC, 1, [
      "status:error",
      `is_subagent:${isSubagent}`,
    ]);
    reportRedisError({
      operation: "write_consumption_root",
      error,
      context: { workspaceId, rootAgentMessageId, agentMessageId },
    });
  }
}
