import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { WebhookSourceViewFactory } from "@app/tests/utils/WebhookSourceViewFactory";
import { Ok } from "@app/types/shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchAutomationTriggers } from "./triggers";

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return { ...mod, searchConsumptionAnalytics: vi.fn() };
});

const PERIOD: ConsumptionPeriod = {
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-08-01T00:00:00.000Z",
};

function mockRanking(
  triggers: { triggerId: string; credits?: number; runs?: number }[]
) {
  vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
    new Ok({
      aggregations: {
        by_trigger: {
          buckets: triggers.map((t) => ({
            key: t.triggerId,
            credit_micro: { value: (t.credits ?? 1) * 1_000_000 },
            runs: { value: t.runs ?? 1 },
          })),
        },
        total_count: { value: triggers.length },
      },
    }) as Awaited<ReturnType<typeof searchConsumptionAnalytics>>
  );
}

describe("fetchAutomationTriggers webhook source display", () => {
  afterEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
  });

  it("shows the name for a webhook source in an accessible space", async () => {
    const { workspace, authenticator, globalSpace } = await createResourceTest({
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
    mockRanking([{ triggerId: trigger.sId }]);

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
    mockRanking([{ triggerId: trigger.sId }]);

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
