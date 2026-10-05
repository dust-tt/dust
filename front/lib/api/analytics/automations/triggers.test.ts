import { fetchAutomationTriggers } from "@app/lib/api/analytics/automations/triggers";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { WebhookSourceViewFactory } from "@app/tests/utils/WebhookSourceViewFactory";
import { Ok } from "@app/types/shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return { ...mod, searchConsumptionAnalytics: vi.fn() };
});

const PERIOD: ConsumptionPeriod = {
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-08-01T00:00:00.000Z",
};

function bucket(triggerId: string, runs: number, creditMicro: number) {
  return {
    key: triggerId,
    credit_micro: { value: creditMicro },
    runs: { value: runs },
  };
}

function mockRanking(buckets: ReturnType<typeof bucket>[]) {
  vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
    new Ok({
      aggregations: {
        by_trigger: { buckets },
        total_count: { value: buckets.length },
      },
    }) as Awaited<ReturnType<typeof searchConsumptionAnalytics>>
  );
}

describe("fetchAutomationTriggers", () => {
  afterEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
  });

  it("keeps the median baseline stable across pages, including low-credit triggers outside the requested page", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const highCreditTrigger = await TriggerFactory.schedule(authenticator, {
      agentConfigurationId: agent.sId,
      name: "High credit trigger",
      configuration: { cron: "0 9 * * *", timezone: "UTC" },
    });
    const lowCreditTrigger = await TriggerFactory.schedule(authenticator, {
      agentConfigurationId: agent.sId,
      name: "Low credit trigger",
      configuration: { cron: "0 9 * * *", timezone: "UTC" },
    });

    // The ranking terms aggregation is not paginated in Elasticsearch: it
    // always returns every active trigger (up to the cardinality
    // threshold), so a low-credit trigger ranked outside page 1 still
    // contributes to the median regardless of the requested offset/limit.
    const buckets = [
      bucket(highCreditTrigger.sId, 100, 100_000_000),
      bucket(lowCreditTrigger.sId, 10, 100_000),
    ];
    mockRanking(buckets);

    const page1 = await fetchAutomationTriggers(authenticator, {
      period: PERIOD,
      limit: 1,
      offset: 0,
    });
    mockRanking(buckets);
    const page2 = await fetchAutomationTriggers(authenticator, {
      period: PERIOD,
      limit: 1,
      offset: 1,
    });

    expect(page1.isOk()).toBe(true);
    expect(page2.isOk()).toBe(true);
    if (!page1.isOk() || !page2.isOk()) {
      return;
    }

    // Both pages see the same page-independent median, derived from the
    // full active set rather than just the triggers ranked on that page.
    expect(page1.value.medianRunCount).toBe(page2.value.medianRunCount);
    expect(page1.value.medianCostPerRun).toBe(page2.value.medianCostPerRun);
    expect(page1.value.medianRunCount).toBe(55);

    expect(page1.value.triggers).toHaveLength(1);
    expect(page1.value.triggers[0].triggerId).toBe(highCreditTrigger.sId);
    expect(page2.value.triggers).toHaveLength(1);
    expect(page2.value.triggers[0].triggerId).toBe(lowCreditTrigger.sId);
  });

  it("narrows the page to the search matches without moving the median baseline", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const matchingTrigger = await TriggerFactory.schedule(authenticator, {
      agentConfigurationId: agent.sId,
      name: "Competitor watch",
      configuration: { cron: "0 9 * * *", timezone: "UTC" },
    });
    const otherTrigger = await TriggerFactory.schedule(authenticator, {
      agentConfigurationId: agent.sId,
      name: "Inbound triage",
      configuration: { cron: "0 9 * * *", timezone: "UTC" },
    });

    const buckets = [
      bucket(matchingTrigger.sId, 100, 100_000_000),
      bucket(otherTrigger.sId, 10, 100_000),
    ];
    mockRanking(buckets);
    const unsearched = await fetchAutomationTriggers(authenticator, {
      period: PERIOD,
      limit: 10,
      offset: 0,
    });
    mockRanking(buckets);
    const searched = await fetchAutomationTriggers(authenticator, {
      period: PERIOD,
      limit: 10,
      offset: 0,
      search: "competitor",
    });

    expect(unsearched.isOk()).toBe(true);
    expect(searched.isOk()).toBe(true);
    if (!unsearched.isOk() || !searched.isOk()) {
      return;
    }

    expect(searched.value.triggers.map((t) => t.triggerId)).toEqual([
      matchingTrigger.sId,
    ]);
    // The cardinality aggregation would have reported 2 here.
    expect(searched.value.totalCount).toBe(1);

    // A search narrows the rows, not the population a row's stats compare
    // against: the breakdown captions say "median across all triggers".
    expect(searched.value.medianRunCount).toBe(unsearched.value.medianRunCount);
    expect(searched.value.medianCostPerRun).toBe(
      unsearched.value.medianCostPerRun
    );
    expect(searched.value.medianRunCount).toBe(55);
  });

  it("returns no rows when the search matches no trigger name", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const trigger = await TriggerFactory.schedule(authenticator, {
      agentConfigurationId: agent.sId,
      name: "Competitor watch",
      configuration: { cron: "0 9 * * *", timezone: "UTC" },
    });

    mockRanking([bucket(trigger.sId, 100, 100_000_000)]);
    const result = await fetchAutomationTriggers(authenticator, {
      period: PERIOD,
      limit: 10,
      offset: 0,
      search: "nothing matches this",
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.triggers).toEqual([]);
    expect(result.value.totalCount).toBe(0);
  });

  it("keeps a zero run-count trigger out of the median without dividing by zero", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const activeTrigger = await TriggerFactory.schedule(authenticator, {
      agentConfigurationId: agent.sId,
      configuration: { cron: "0 9 * * *", timezone: "UTC" },
    });
    const neverRanTrigger = await TriggerFactory.schedule(authenticator, {
      agentConfigurationId: agent.sId,
      configuration: { cron: "0 9 * * *", timezone: "UTC" },
    });

    mockRanking([
      bucket(activeTrigger.sId, 10, 50_000_000),
      // A trigger with credits attributed but no completed run yet.
      bucket(neverRanTrigger.sId, 0, 0),
    ]);

    const result = await fetchAutomationTriggers(authenticator, {
      period: PERIOD,
      limit: 10,
      offset: 0,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(Number.isFinite(result.value.medianRunCount)).toBe(true);
    expect(Number.isFinite(result.value.medianCostPerRun)).toBe(true);
    expect(result.value.medianRunCount).toBe(10);
    expect(result.value.medianCostPerRun).toBe(5);
  });
});

describe("fetchAutomationTriggers webhook source display", () => {
  afterEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
  });

  it("shows the name for a webhook source in an accessible space", async () => {
    const { workspace, authenticator, globalSpace } = await createResourceTest({
      plan: "creditPriced",
      role: "manager",
    });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const view = await new WebhookSourceViewFactory(workspace).create(
      globalSpace,
      { customName: "Accessible Source" }
    );
    const trigger = await TriggerFactory.webhook(authenticator, {
      agentConfigurationId: agent.sId,
      webhookSourceViewId: Number(view.id),
    });
    mockRanking([bucket(trigger.sId, 1, 1_000_000)]);

    const result = await fetchAutomationTriggers(authenticator, {
      period: PERIOD,
      limit: 10,
      offset: 0,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.triggers[0]).toMatchObject({
      webhookSourceName: view.name,
      webhookSourceRestricted: false,
    });
  });

  it("labels a webhook source in a space the caller can't access as restricted", async () => {
    const { workspace, authenticator } = await createResourceTest({
      plan: "creditPriced",
      role: "manager",
    });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const view = await new WebhookSourceViewFactory(workspace).create(
      restrictedSpace,
      { customName: "Restricted Source" }
    );
    const trigger = await TriggerFactory.webhook(authenticator, {
      agentConfigurationId: agent.sId,
      webhookSourceViewId: Number(view.id),
    });
    mockRanking([bucket(trigger.sId, 1, 1_000_000)]);

    const result = await fetchAutomationTriggers(authenticator, {
      period: PERIOD,
      limit: 10,
      offset: 0,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value.triggers[0]).toMatchObject({
      webhookSourceName: null,
      webhookSourceRestricted: true,
    });
  });

  // No test for a deleted/missing webhook source view: both
  // `triggers.webhookSourceViewId -> webhook_sources_views.id` and
  // `webhook_sources_views.webhookSourceId -> webhook_sources.id` are
  // RESTRICT foreign keys, so a trigger can never end up pointing at a view
  // (or a view at a source) that no longer exists — confirmed by attempting
  // both inserts here, which Postgres itself rejects. The fallback in
  // `resolveWebhookSources` for that case is defensive dead code.
});
