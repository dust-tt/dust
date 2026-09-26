import {
  makeConsumptionRootAgentMessageField,
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
const ROOT_AGENT_MESSAGE_ID = 100;

describe("agent-message consumption root counters", () => {
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
    vi.clearAllMocks();
    await runOnRedisCache({ origin: "consumption" }, (redis) =>
      redis.del(
        makeConsumptionRootKey({
          workspaceId: WORKSPACE_ID,
          rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
        })
      )
    );
  });

  afterAll(async () => {
    await closeRedisClients();
  });

  it("replaces an agent message total instead of adding it twice", async () => {
    await consumptionCounters.recordAgentMessageTotal({
      workspaceId: WORKSPACE_ID,
      rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      agentMessageId: ROOT_AGENT_MESSAGE_ID,
      totalCreditAmountMicro: 1_000_000,
    });
    await consumptionCounters.recordAgentMessageTotal({
      workspaceId: WORKSPACE_ID,
      rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      agentMessageId: ROOT_AGENT_MESSAGE_ID,
      totalCreditAmountMicro: 1_400_000,
    });

    const total = await runOnRedisCache({ origin: "consumption" }, (redis) =>
      redis.hGet(
        makeConsumptionRootKey({
          workspaceId: WORKSPACE_ID,
          rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
        }),
        makeConsumptionRootAgentMessageField(ROOT_AGENT_MESSAGE_ID)
      )
    );
    expect(total).toBe("1400000");
  });

  it("sums message totals and counts each subagent once", async () => {
    await consumptionCounters.recordAgentMessageTotal({
      workspaceId: WORKSPACE_ID,
      rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      agentMessageId: ROOT_AGENT_MESSAGE_ID,
      totalCreditAmountMicro: 1_000_000,
    });
    for (const totalCreditAmountMicro of [2_000_000, 2_500_000]) {
      await consumptionCounters.recordAgentMessageTotal({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
        agentMessageId: 101,
        totalCreditAmountMicro,
      });
    }

    await expect(
      consumptionCounters.readRootTotals({
        workspaceId: WORKSPACE_ID,
        rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      })
    ).resolves.toEqual({
      totalCreditAmountMicro: 3_500_000,
      subagentCount: 1,
    });
  });

  it("reports successful shadow writes", async () => {
    await consumptionCounters.recordAgentMessageTotal({
      workspaceId: WORKSPACE_ID,
      rootAgentMessageId: ROOT_AGENT_MESSAGE_ID,
      agentMessageId: ROOT_AGENT_MESSAGE_ID,
      totalCreditAmountMicro: 1_000_000,
    });

    expect(statsDMetrics.increment).toHaveBeenCalledWith(
      "consumption.root_hash_write.count",
      1,
      ["status:success", "is_subagent:false"]
    );
  });
});
