import {
  CONSUMPTION_ROOT_TOTAL_FIELD,
  makeConsumptionRootKey,
} from "@app/lib/api/assistant/consumption/keys";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.unmock("@app/lib/api/redis");
vi.mock("@app/lib/utils/statsd", () => ({
  statsDMetrics: {
    decrement: vi.fn(),
    distribution: vi.fn(),
    increment: vi.fn(),
  },
}));

type RedisModule = typeof import("@app/lib/api/redis");
type ConsumptionCountersModule =
  typeof import("@app/lib/api/assistant/consumption/counters");
type StatsModule = typeof import("@app/lib/utils/statsd");

let closeRedisClients: RedisModule["closeRedisClients"];
let runOnRedisCache: RedisModule["runOnRedisCache"];
let consumptionCounters: ConsumptionCountersModule;
let statsDMetrics: StatsModule["statsDMetrics"];

const WORKSPACE_ID = "ws1";
const RUN_KEY = "run-x";
const ROOT_AGENT_MESSAGE_ID = 100;

async function applyTotal({
  totalCreditAmountMicro,
  runKey = RUN_KEY,
  agentMessageId = ROOT_AGENT_MESSAGE_ID,
}: {
  totalCreditAmountMicro: number;
  runKey?: string;
  agentMessageId?: number;
}): Promise<void> {
  return consumptionCounters.applyExecutionTotal({
    workspaceId: WORKSPACE_ID,
    runKey,
    rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
    agentMessageId,
    totalCreditAmountMicro,
  });
}

describe("agent-message consumption aggregate counters", () => {
  beforeAll(async () => {
    const redisModule = await import("@app/lib/api/redis");
    const countersModule = await import(
      "@app/lib/api/assistant/consumption/counters"
    );
    const statsModule = await import("@app/lib/utils/statsd");

    closeRedisClients = redisModule.closeRedisClients;
    runOnRedisCache = redisModule.runOnRedisCache;
    consumptionCounters = countersModule;
    statsDMetrics = statsModule.statsDMetrics;
  });

  beforeEach(async () => {
    await runOnRedisCache({ origin: "consumption" }, (redis) =>
      redis.del(
        makeConsumptionRootKey({
          workspaceId: WORKSPACE_ID,
          rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
        })
      )
    );
    await consumptionCounters.seedRootTotals({
      workspaceId: WORKSPACE_ID,
      rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      expectedRevision: 0,
      totals: { totalCreditAmountMicro: 0, subagentCount: 0 },
      executionCreditAmountMicroByRunKey: new Map(),
      subagentAgentMessageIds: [],
    });
  });

  afterAll(async () => {
    await closeRedisClients();
  });

  it("replaces an execution total and adjusts the root by the difference", async () => {
    await applyTotal({ totalCreditAmountMicro: 1_000_000 });
    await applyTotal({ totalCreditAmountMicro: 1_400_000 });

    expect(
      await consumptionCounters.readRootTotals({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      })
    ).toEqual({ totalCreditAmountMicro: 1_400_000, subagentCount: 0 });
    expect(
      await consumptionCounters.readExecutionTotal({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
        runKey: RUN_KEY,
      })
    ).toBe(1_400_000);
  });

  it("safely replaces an execution total when an outbox event is replayed", async () => {
    await applyTotal({ totalCreditAmountMicro: 2_000_000 });
    await applyTotal({ totalCreditAmountMicro: 9_000_000 });
    await applyTotal({ totalCreditAmountMicro: 9_000_000 });
    expect(
      await consumptionCounters.readRootTotals({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      })
    ).toEqual({ totalCreditAmountMicro: 9_000_000, subagentCount: 0 });
  });

  it("counts one sub-agent message once across resumed executions", async () => {
    await applyTotal({
      totalCreditAmountMicro: 0,
      agentMessageId: 101,
      runKey: "first-execution",
    });
    await applyTotal({
      totalCreditAmountMicro: 0,
      agentMessageId: 101,
      runKey: "resumed-execution",
    });

    expect(
      await consumptionCounters.readRootTotals({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      })
    ).toEqual({ totalCreditAmountMicro: 0, subagentCount: 1 });
  });

  it("seeds a missing root without overwriting live totals", async () => {
    await runOnRedisCache({ origin: "consumption" }, (redis) =>
      redis.del(
        makeConsumptionRootKey({
          workspaceId: WORKSPACE_ID,
          rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
        })
      )
    );
    await consumptionCounters.seedRootTotals({
      workspaceId: WORKSPACE_ID,
      rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      expectedRevision: 0,
      totals: { totalCreditAmountMicro: 4_000_000, subagentCount: 3 },
      executionCreditAmountMicroByRunKey: new Map([[RUN_KEY, 4_000_000]]),
      subagentAgentMessageIds: [101, 102, 103],
    });
    await consumptionCounters.seedRootTotals({
      workspaceId: WORKSPACE_ID,
      rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      expectedRevision: 0,
      totals: { totalCreditAmountMicro: 9_000_000, subagentCount: 7 },
      executionCreditAmountMicroByRunKey: new Map([[RUN_KEY, 9_000_000]]),
      subagentAgentMessageIds: [101, 102, 103, 104, 105, 106, 107],
    });

    expect(
      await consumptionCounters.readRootTotals({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      })
    ).toEqual({ totalCreditAmountMicro: 4_000_000, subagentCount: 3 });
    expect(
      await consumptionCounters.readExecutionTotal({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
        runKey: RUN_KEY,
      })
    ).toBe(4_000_000);

    await applyTotal({
      totalCreditAmountMicro: 4_500_000,
      agentMessageId: 101,
    });
    expect(
      await consumptionCounters.readRootTotals({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      })
    ).toEqual({ totalCreditAmountMicro: 4_500_000, subagentCount: 3 });
  });

  it("rejects a stale rebuild after an execution changed", async () => {
    await runOnRedisCache({ origin: "consumption" }, (redis) =>
      redis.del(
        makeConsumptionRootKey({
          workspaceId: WORKSPACE_ID,
          rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
        })
      )
    );
    await applyTotal({ totalCreditAmountMicro: 1_000_000 });

    expect(
      await consumptionCounters.readRootTotals({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      })
    ).toBeNull();
    await expect(
      consumptionCounters.seedRootTotals({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
        expectedRevision: 0,
        totals: { totalCreditAmountMicro: 0, subagentCount: 0 },
        executionCreditAmountMicroByRunKey: new Map(),
        subagentAgentMessageIds: [],
      })
    ).resolves.toBe(false);

    const revision = await consumptionCounters.readRootRevision({
      workspaceId: WORKSPACE_ID,
      rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
    });
    await expect(
      consumptionCounters.seedRootTotals({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
        expectedRevision: revision,
        totals: { totalCreditAmountMicro: 1_000_000, subagentCount: 0 },
        executionCreditAmountMicroByRunKey: new Map([[RUN_KEY, 1_000_000]]),
        subagentAgentMessageIds: [],
      })
    ).resolves.toBe(true);
  });

  it("reports root projection failures through the shared Redis alert metric", async () => {
    const rootKey = makeConsumptionRootKey({
      workspaceId: WORKSPACE_ID,
      rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
    });
    await runOnRedisCache({ origin: "consumption" }, (redis) =>
      redis.hSet(rootKey, CONSUMPTION_ROOT_TOTAL_FIELD, "invalid")
    );

    await expect(
      consumptionCounters.readRootTotals({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      })
    ).rejects.toThrow("Consumption root contains a non-integer counter");
    expect(statsDMetrics.increment).toHaveBeenCalledWith(
      "ratelimiter.error.count",
      1,
      ["operation:read_consumption_root_totals"]
    );
  });
});
