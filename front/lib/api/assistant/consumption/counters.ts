import {
  CONSUMPTION_KEY_TTL_MS,
  CONSUMPTION_ROOT_INITIALIZED_FIELD,
  CONSUMPTION_ROOT_REVISION_FIELD,
  CONSUMPTION_ROOT_SUBAGENTS_FIELD,
  CONSUMPTION_ROOT_TOTAL_FIELD,
  makeConsumptionRootExecutionField,
  makeConsumptionRootKey,
  makeConsumptionRootSubagentField,
} from "@app/lib/api/assistant/consumption/keys";
import { runOnRedisCache } from "@app/lib/api/redis";
import { reportRedisCounterError } from "@app/lib/utils/rate_limiter";
import type { ModelId } from "@app/types/shared/model_id";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import assert from "assert";

export type ConsumptionRootTotals = {
  totalCreditAmountMicro: number;
  subagentCount: number;
};

type AgentMessageConsumptionAggregateOperation =
  | "apply_consumption_execution_total"
  | "read_consumption_execution_total"
  | "read_consumption_root_revision"
  | "read_consumption_root_totals"
  | "seed_consumption_root_totals";

/**
 * Atomically replaces one execution total and updates its root aggregates.
 *
 * KEYS:
 * - KEYS[1]: Root consumption hash key.
 *
 * ARGV:
 * - ARGV[1]: Execution total field (`x:<runKey>`).
 * - ARGV[2]: Replacement execution total in microcredits.
 * - ARGV[3]: Root total field.
 * - ARGV[4]: Root subagent count field.
 * - ARGV[5]: Subagent marker field (`a:<agentMessageId>`), or empty for the root agent.
 * - ARGV[6]: Root revision field.
 * - ARGV[7]: Hash TTL in milliseconds.
 */
const APPLY_EXECUTION_TOTAL_SCRIPT = `
local previous = tonumber(redis.call("HGET", KEYS[1], ARGV[1]) or "0")
local current = tonumber(ARGV[2])
redis.call("HSET", KEYS[1], ARGV[1], ARGV[2])
redis.call("HINCRBY", KEYS[1], ARGV[3], current - previous)

if ARGV[5] ~= "" and redis.call("HSETNX", KEYS[1], ARGV[5], "1") == 1 then
  redis.call("HINCRBY", KEYS[1], ARGV[4], 1)
end

redis.call("HINCRBY", KEYS[1], ARGV[6], 1)
redis.call("PEXPIRE", KEYS[1], ARGV[7])
`;

/**
 * Seeds a missing root hash only when its revision still matches the snapshot.
 *
 * KEYS:
 * - KEYS[1]: Root consumption hash key.
 *
 * ARGV:
 * - ARGV[1]: Root initialized field.
 * - ARGV[2]: Root revision field.
 * - ARGV[3]: Revision observed before loading the seed snapshot.
 * - ARGV[4]: Root total field.
 * - ARGV[5]: Root subagent count field.
 * - ARGV[6]: Seed total in microcredits.
 * - ARGV[7]: Seed subagent count.
 * - ARGV[8]: Hash TTL in milliseconds.
 * - ARGV[9...]: Alternating execution-total or subagent-marker hash fields and values.
 *
 * Returns 1 when seeded, 0 when already initialized, and -1 on revision mismatch.
 */
const SEED_ROOT_TOTALS_SCRIPT = `
local initialized_field = ARGV[1]
local revision_field = ARGV[2]
local expected_revision = tonumber(ARGV[3])
local total_field = ARGV[4]
local subagents_field = ARGV[5]
local total = ARGV[6]
local subagents = ARGV[7]
local ttl = ARGV[8]

if redis.call("HEXISTS", KEYS[1], initialized_field) == 1 then
  return 0
end

local current_revision = tonumber(redis.call("HGET", KEYS[1], revision_field) or "0")
if current_revision ~= expected_revision then
  return -1
end

redis.call("DEL", KEYS[1])
redis.call("HSET", KEYS[1], initialized_field, "1", revision_field, expected_revision, total_field, total, subagents_field, subagents)
for index = 9, #ARGV, 2 do
  redis.call("HSET", KEYS[1], ARGV[index], ARGV[index + 1])
end
redis.call("PEXPIRE", KEYS[1], ttl)
return 1
`;

function parseInteger(value: string | null | undefined): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("Consumption root contains a non-integer counter");
  }
  return parsed;
}

/**
 * @cc [owner:id13,label:logging;error-handling] consumption-aggregate-error-alerting
 * Every Redis or stored-value failure handled by this module MUST be reported through
 * `reportRedisCounterError` before it is rethrown.
 */
async function runConsumptionRedisOperation<T>({
  operation,
  context,
  callback,
}: {
  operation: AgentMessageConsumptionAggregateOperation;
  context: Record<string, unknown>;
  callback: () => Promise<T>;
}): Promise<T> {
  try {
    return await callback();
  } catch (error) {
    reportRedisCounterError({ operation, error, context });
    throw normalizeError(error);
  }
}

/**
 * @cc [owner:id13,label:architecture;backend] consumption-aggregate-ownership
 * Agent-message consumption root aggregates MUST be accessed through the aggregate functions in
 * this module instead of direct Redis calls.
 */
/**
 * @cc [owner:id13,label:backend;concurrency] root-execution-total-atomicity
 * Applying an execution total MUST atomically replace that run's total, adjust the root total by
 * the replacement delta, count each non-root agent message at most once, increment the revision,
 * and refresh the root TTL.
 */
export async function applyExecutionTotal({
  workspaceId,
  runKey,
  rootAgentMessageId,
  agentMessageId,
  totalCreditAmountMicro,
}: {
  workspaceId: string;
  runKey: string;
  rootAgentMessageId: ModelId;
  agentMessageId: ModelId;
  totalCreditAmountMicro: number;
}): Promise<void> {
  assert(
    Number.isSafeInteger(totalCreditAmountMicro) && totalCreditAmountMicro >= 0,
    "Consumption execution total must be a non-negative integer"
  );
  const rootKey = makeConsumptionRootKey({ workspaceId, rootAgentMessageId });

  await runConsumptionRedisOperation({
    operation: "apply_consumption_execution_total",
    context: { workspaceId, rootAgentMessageId, agentMessageId, runKey },
    callback: () =>
      runOnRedisCache({ origin: "consumption" }, async (redis) => {
        await redis.eval(APPLY_EXECUTION_TOTAL_SCRIPT, {
          keys: [rootKey],
          arguments: [
            makeConsumptionRootExecutionField(runKey),
            totalCreditAmountMicro.toString(),
            CONSUMPTION_ROOT_TOTAL_FIELD,
            CONSUMPTION_ROOT_SUBAGENTS_FIELD,
            agentMessageId === rootAgentMessageId
              ? ""
              : makeConsumptionRootSubagentField(agentMessageId),
            CONSUMPTION_ROOT_REVISION_FIELD,
            CONSUMPTION_KEY_TTL_MS.toString(),
          ],
        });
      }),
  });
}

export async function readRootTotals({
  workspaceId,
  rootAgentMessageId,
}: {
  workspaceId: string;
  rootAgentMessageId: ModelId;
}): Promise<ConsumptionRootTotals | null> {
  return runConsumptionRedisOperation({
    operation: "read_consumption_root_totals",
    context: { workspaceId, rootAgentMessageId },
    callback: async () => {
      const rootKey = makeConsumptionRootKey({
        workspaceId,
        rootAgentMessageId,
      });
      const [initialized, total, subagents] = await runOnRedisCache(
        { origin: "consumption" },
        (redis) =>
          redis.hmGet(rootKey, [
            CONSUMPTION_ROOT_INITIALIZED_FIELD,
            CONSUMPTION_ROOT_TOTAL_FIELD,
            CONSUMPTION_ROOT_SUBAGENTS_FIELD,
          ])
      );

      if (initialized === null) {
        return null;
      }
      return {
        totalCreditAmountMicro: parseInteger(total),
        subagentCount: parseInteger(subagents),
      };
    },
  });
}

export async function readRootRevision({
  workspaceId,
  rootAgentMessageId,
}: {
  workspaceId: string;
  rootAgentMessageId: ModelId;
}): Promise<number> {
  return runConsumptionRedisOperation({
    operation: "read_consumption_root_revision",
    context: { workspaceId, rootAgentMessageId },
    callback: async () => {
      const revision = await runOnRedisCache(
        { origin: "consumption" },
        (redis) =>
          redis.hGet(
            makeConsumptionRootKey({ workspaceId, rootAgentMessageId }),
            CONSUMPTION_ROOT_REVISION_FIELD
          )
      );
      return parseInteger(revision);
    },
  });
}

/**
 * @cc [owner:id13,label:backend;concurrency] root-seed-compare-and-set
 * Seeding MUST leave initialized roots untouched and MUST replace an uninitialized root only when
 * its current revision equals `expectedRevision`.
 */
export async function seedRootTotals({
  workspaceId,
  rootAgentMessageId,
  expectedRevision,
  totals,
  executionCreditAmountMicroByRunKey,
  subagentAgentMessageIds,
}: {
  workspaceId: string;
  rootAgentMessageId: ModelId;
  expectedRevision: number;
  totals: ConsumptionRootTotals;
  executionCreditAmountMicroByRunKey: ReadonlyMap<string, number>;
  subagentAgentMessageIds: readonly ModelId[];
}): Promise<boolean> {
  assert(
    Number.isSafeInteger(expectedRevision) && expectedRevision >= 0,
    "Consumption root revision must be a non-negative integer"
  );
  assert(
    Number.isSafeInteger(totals.totalCreditAmountMicro) &&
      totals.totalCreditAmountMicro >= 0 &&
      Number.isSafeInteger(totals.subagentCount) &&
      totals.subagentCount >= 0,
    "Consumption root seed totals must be non-negative integers"
  );
  let executionTotal = 0;
  for (const totalCreditAmountMicro of executionCreditAmountMicroByRunKey.values()) {
    assert(
      Number.isSafeInteger(totalCreditAmountMicro) &&
        totalCreditAmountMicro >= 0,
      "Consumption execution seed total must be a non-negative integer"
    );
    executionTotal += totalCreditAmountMicro;
  }
  assert(
    executionTotal === totals.totalCreditAmountMicro,
    "Consumption execution seed totals must equal the root total"
  );
  assert(
    new Set(subagentAgentMessageIds).size === subagentAgentMessageIds.length &&
      subagentAgentMessageIds.length === totals.subagentCount,
    "Consumption subagent seed IDs must be unique and equal the root count"
  );

  return runConsumptionRedisOperation({
    operation: "seed_consumption_root_totals",
    context: { workspaceId, rootAgentMessageId, expectedRevision },
    callback: () =>
      runOnRedisCache({ origin: "consumption" }, async (redis) => {
        const seeded = await redis.eval(SEED_ROOT_TOTALS_SCRIPT, {
          keys: [makeConsumptionRootKey({ workspaceId, rootAgentMessageId })],
          arguments: [
            CONSUMPTION_ROOT_INITIALIZED_FIELD,
            CONSUMPTION_ROOT_REVISION_FIELD,
            expectedRevision.toString(),
            CONSUMPTION_ROOT_TOTAL_FIELD,
            CONSUMPTION_ROOT_SUBAGENTS_FIELD,
            totals.totalCreditAmountMicro.toString(),
            totals.subagentCount.toString(),
            CONSUMPTION_KEY_TTL_MS.toString(),
            ...[...executionCreditAmountMicroByRunKey].flatMap(
              ([runKey, totalCreditAmountMicro]) => [
                makeConsumptionRootExecutionField(runKey),
                totalCreditAmountMicro.toString(),
              ]
            ),
            ...subagentAgentMessageIds.flatMap((agentMessageId) => [
              makeConsumptionRootSubagentField(agentMessageId),
              "1",
            ]),
          ],
        });
        return seeded === 1;
      }),
  });
}

export async function readExecutionTotal({
  workspaceId,
  rootAgentMessageId,
  runKey,
}: {
  workspaceId: string;
  rootAgentMessageId: ModelId;
  runKey: string;
}): Promise<number | null> {
  return runConsumptionRedisOperation({
    operation: "read_consumption_execution_total",
    context: { workspaceId, rootAgentMessageId, runKey },
    callback: async () => {
      const total = await runOnRedisCache({ origin: "consumption" }, (redis) =>
        redis.hGet(
          makeConsumptionRootKey({ workspaceId, rootAgentMessageId }),
          makeConsumptionRootExecutionField(runKey)
        )
      );
      return total === undefined || total === null ? null : parseInteger(total);
    },
  });
}
