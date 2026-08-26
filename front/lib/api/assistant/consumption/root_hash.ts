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
import { runOnRedis } from "@app/lib/api/redis";
import type { AgentMessageModel } from "@app/lib/models/agent/conversation";
import assert from "assert";

const REDIS_ORIGIN = "consumption" as const;

export type ConsumptionRootTotals = {
  totalCreditAmountMicro: number;
  subagentCount: number;
};

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

const SEED_ROOT_TOTALS_SCRIPT = `
if redis.call("HEXISTS", KEYS[1], ARGV[1]) == 1 then
  return 0
end

local current_revision = tonumber(redis.call("HGET", KEYS[1], ARGV[2]) or "0")
if current_revision ~= tonumber(ARGV[3]) then
  return -1
end

redis.call("DEL", KEYS[1])
redis.call("HSET", KEYS[1], ARGV[1], "1", ARGV[2], ARGV[3], ARGV[4], ARGV[6], ARGV[5], ARGV[7])
for index = 9, #ARGV, 2 do
  redis.call("HSET", KEYS[1], ARGV[index], ARGV[index + 1])
end
redis.call("PEXPIRE", KEYS[1], ARGV[8])
return 1
`;

function parseInteger(value: string | null | undefined): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("Consumption root contains a non-integer counter");
  }
  return parsed;
}

export async function applyConsumptionExecutionTotal({
  workspaceId,
  runKey,
  rootAgentMessageId,
  totalCreditAmountMicro,
  subagentAgentMessageId,
}: {
  workspaceId: string;
  runKey: string;
  rootAgentMessageId: string;
  totalCreditAmountMicro: number;
  subagentAgentMessageId: AgentMessageModel["id"] | null;
}): Promise<void> {
  assert(
    Number.isSafeInteger(totalCreditAmountMicro) && totalCreditAmountMicro >= 0,
    "Consumption execution total must be a non-negative integer"
  );
  const rootKey = makeConsumptionRootKey({ workspaceId, rootAgentMessageId });

  await runOnRedis({ origin: REDIS_ORIGIN }, async (redis) => {
    await redis.eval(APPLY_EXECUTION_TOTAL_SCRIPT, {
      keys: [rootKey],
      arguments: [
        makeConsumptionRootExecutionField(runKey),
        totalCreditAmountMicro.toString(),
        CONSUMPTION_ROOT_TOTAL_FIELD,
        CONSUMPTION_ROOT_SUBAGENTS_FIELD,
        subagentAgentMessageId === null
          ? ""
          : makeConsumptionRootSubagentField(subagentAgentMessageId),
        CONSUMPTION_ROOT_REVISION_FIELD,
        CONSUMPTION_KEY_TTL_MS.toString(),
      ],
    });
  });
}

export async function readConsumptionRootTotals({
  workspaceId,
  rootAgentMessageId,
}: {
  workspaceId: string;
  rootAgentMessageId: string;
}): Promise<ConsumptionRootTotals | null> {
  const rootKey = makeConsumptionRootKey({ workspaceId, rootAgentMessageId });
  const [initialized, total, subagents] = await runOnRedis(
    { origin: REDIS_ORIGIN },
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
}

export async function readConsumptionRootRevision({
  workspaceId,
  rootAgentMessageId,
}: {
  workspaceId: string;
  rootAgentMessageId: string;
}): Promise<number> {
  const revision = await runOnRedis({ origin: REDIS_ORIGIN }, (redis) =>
    redis.hGet(
      makeConsumptionRootKey({ workspaceId, rootAgentMessageId }),
      CONSUMPTION_ROOT_REVISION_FIELD
    )
  );
  return parseInteger(revision);
}

export async function seedConsumptionRootTotals({
  workspaceId,
  rootAgentMessageId,
  expectedRevision,
  totals,
  executionCreditAmountMicroByRunKey,
  subagentAgentMessageIds,
}: {
  workspaceId: string;
  rootAgentMessageId: string;
  expectedRevision: number;
  totals: ConsumptionRootTotals;
  executionCreditAmountMicroByRunKey: ReadonlyMap<string, number>;
  subagentAgentMessageIds: readonly AgentMessageModel["id"][];
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
  const rootKey = makeConsumptionRootKey({ workspaceId, rootAgentMessageId });
  return runOnRedis({ origin: REDIS_ORIGIN }, async (redis) => {
    const seeded = await redis.eval(SEED_ROOT_TOTALS_SCRIPT, {
      keys: [rootKey],
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
  });
}

export async function readConsumptionExecutionTotal({
  workspaceId,
  rootAgentMessageId,
  runKey,
}: {
  workspaceId: string;
  rootAgentMessageId: string;
  runKey: string;
}): Promise<number | null> {
  const total = await runOnRedis({ origin: REDIS_ORIGIN }, (redis) =>
    redis.hGet(
      makeConsumptionRootKey({ workspaceId, rootAgentMessageId }),
      makeConsumptionRootExecutionField(runKey)
    )
  );
  return total === undefined || total === null ? null : parseInteger(total);
}
