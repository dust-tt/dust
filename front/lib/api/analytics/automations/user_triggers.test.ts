import { fetchUserAutomationTriggers } from "@app/lib/api/analytics/automations/user_triggers";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Err, Ok } from "@app/types/shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return { ...mod, searchConsumptionAnalytics: vi.fn() };
});

const PERIOD: ConsumptionPeriod = {
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-08-01T00:00:00.000Z",
};

function mockConsumption(
  buckets: { key: string; runs: number; creditMicro: number }[]
) {
  vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
    new Ok({
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: {
        total: { value: 0, relation: "eq" },
        max_score: null,
        hits: [],
      },
      aggregations: {
        by_trigger: {
          buckets: buckets.map(({ key, runs, creditMicro }) => ({
            key,
            credit_micro: { value: creditMicro },
            runs: { value: runs },
          })),
        },
        total_count: { value: buckets.length },
      },
    })
  );
}

async function scheduleTrigger(
  auth: Authenticator,
  { agentConfigurationId, name }: { agentConfigurationId: string; name: string }
) {
  return TriggerFactory.schedule(auth, {
    agentConfigurationId,
    name,
    configuration: { cron: "0 9 * * *", timezone: "UTC" },
  });
}

describe("fetchUserAutomationTriggers", () => {
  afterEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
  });

  it("lists the triggers that never ran after the ones that consumed", async () => {
    const { authenticator } = await createResourceTest({ role: "user" });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const consuming = await scheduleTrigger(authenticator, {
      agentConfigurationId: agent.sId,
      name: "Competitor watch",
    });
    const idle = await scheduleTrigger(authenticator, {
      agentConfigurationId: agent.sId,
      name: "Never ran",
    });
    mockConsumption([{ key: consuming.sId, runs: 4, creditMicro: 8_000_000 }]);

    const result = await fetchUserAutomationTriggers(authenticator, {
      period: PERIOD,
      limit: 25,
      offset: 0,
    });

    const { triggers, totalCount, isConsumptionAvailable } = result;
    expect(totalCount).toBe(2);
    expect(isConsumptionAvailable).toBe(true);
    expect(triggers.map((trigger) => trigger.triggerId)).toEqual([
      consuming.sId,
      idle.sId,
    ]);
    expect(triggers[0]).toMatchObject({ runCount: 4, credits: 8 });
    expect(triggers[1]).toMatchObject({ runCount: 0, credits: 0 });
    expect(result.agents).toEqual([
      {
        agentId: agent.sId,
        name: agent.name,
        pictureUrl: agent.pictureUrl,
      },
    ]);
  });

  it("leaves out the triggers of other members", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "user",
    });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const mine = await scheduleTrigger(authenticator, {
      agentConfigurationId: agent.sId,
      name: "Mine",
    });

    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );
    await scheduleTrigger(otherAuth, {
      agentConfigurationId: agent.sId,
      name: "Theirs",
    });

    mockConsumption([]);

    const result = await fetchUserAutomationTriggers(authenticator, {
      period: PERIOD,
      limit: 25,
      offset: 0,
    });

    const { triggers, totalCount } = result;
    expect(totalCount).toBe(1);
    expect(triggers.map((trigger) => trigger.triggerId)).toEqual([mine.sId]);
    expect(vi.mocked(searchConsumptionAnalytics)).toHaveBeenCalledWith(
      expect.objectContaining({
        bool: {
          filter: expect.arrayContaining([
            { term: { "user.id": authenticator.getNonNullableUser().sId } },
          ]),
        },
      }),
      expect.anything()
    );
  });

  it("still lists the triggers when the consumption query fails", async () => {
    const { authenticator } = await createResourceTest({ role: "user" });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const trigger = await scheduleTrigger(authenticator, {
      agentConfigurationId: agent.sId,
      name: "Competitor watch",
    });
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "boom"))
    );

    const result = await fetchUserAutomationTriggers(authenticator, {
      period: PERIOD,
      limit: 25,
      offset: 0,
    });

    expect(result.isConsumptionAvailable).toBe(false);
    expect(result.triggers.map((t) => t.triggerId)).toEqual([trigger.sId]);
    expect(result.triggers[0]).toMatchObject({ runCount: 0, credits: 0 });
  });

  it("filters agents in Elasticsearch and applies kind and name filters", async () => {
    const { authenticator } = await createResourceTest({ role: "user" });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const schedule = await scheduleTrigger(authenticator, {
      agentConfigurationId: agent.sId,
      name: "Morning digest",
    });
    await TriggerFactory.webhook(authenticator, {
      agentConfigurationId: agent.sId,
      name: "Inbound digest",
    });
    mockConsumption([]);

    const kindFiltered = await fetchUserAutomationTriggers(authenticator, {
      period: PERIOD,
      limit: 25,
      offset: 0,
      filter: { agentIds: [agent.sId], kinds: ["schedule"] },
    });
    expect(kindFiltered.triggers.map((t) => t.triggerId)).toEqual([
      schedule.sId,
    ]);
    expect(vi.mocked(searchConsumptionAnalytics)).toHaveBeenLastCalledWith(
      expect.objectContaining({
        bool: {
          filter: expect.arrayContaining([
            { term: { "agent.attributed_id": agent.sId } },
          ]),
        },
      }),
      expect.anything()
    );

    const searched = await fetchUserAutomationTriggers(authenticator, {
      period: PERIOD,
      limit: 25,
      offset: 0,
      search: "morning",
    });
    expect(searched.triggers.map((t) => t.triggerId)).toEqual([schedule.sId]);
  });
});
