import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return { ...mod, searchConsumptionAnalytics: vi.fn() };
});

function postTriggersRequest(wId: string, body: Record<string, unknown> = {}) {
  return honoApp.request(`/api/w/${wId}/me/analytics/automations/triggers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockConsumption() {
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
        by_trigger: { buckets: [] },
        total_count: { value: 0 },
      },
    })
  );
}

describe("POST /api/w/:wId/me/analytics/automations/triggers", () => {
  afterEach(() => {
    vi.mocked(searchConsumptionAnalytics).mockReset();
  });

  it("returns the caller's own triggers", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await TriggerFactory.schedule(auth, {
      agentConfigurationId: agent.sId,
      name: "Competitor watch",
      configuration: { cron: "0 9 * * *", timezone: "UTC" },
    });
    mockConsumption();

    const response = await postTriggersRequest(workspace.sId);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      totalCount: 1,
      isConsumptionAvailable: true,
      triggers: [
        expect.objectContaining({
          triggerId: trigger.sId,
          name: "Competitor watch",
          runCount: 0,
          credits: 0,
        }),
      ],
    });
  });

  it("applies filters and validates the request", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    await TriggerFactory.schedule(auth, {
      agentConfigurationId: agent.sId,
      name: "Competitor watch",
      configuration: { cron: "0 9 * * *", timezone: "UTC" },
    });
    mockConsumption();

    const filtered = await postTriggersRequest(workspace.sId, {
      search: "  competitor  ",
      filter: { agentIds: [agent.sId], kinds: ["schedule"] },
    });
    expect(filtered.status).toBe(200);
    await expect(filtered.json()).resolves.toMatchObject({ totalCount: 1 });

    const pooled = await postTriggersRequest(workspace.sId, {
      filter: { executionModes: ["workspace_pool"] },
    });
    expect(pooled.status).toBe(200);
    await expect(pooled.json()).resolves.toMatchObject({ totalCount: 0 });

    const invalid = await postTriggersRequest(workspace.sId, { offset: -1 });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { type: "invalid_request_error" },
    });
  });
});
