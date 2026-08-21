import { DEFAULT_AUTOMATION_TRIGGERS_LIMIT } from "@app/lib/api/analytics/automations/schema";
import type { UserAutomationTriggers } from "@app/lib/api/analytics/automations/user_triggers";
import { fetchUserAutomationTriggers } from "@app/lib/api/analytics/automations/user_triggers";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  import("@app/lib/api/analytics/automations/user_triggers"),
  async (orig) => {
    const mod = await orig();
    return {
      ...mod,
      fetchUserAutomationTriggers: vi.fn(),
    };
  }
);

const TRIGGERS: UserAutomationTriggers = {
  period: {
    startDate: "2026-07-01T00:00:00.000Z",
    endDate: "2026-08-01T00:00:00.000Z",
  },
  totalCount: 1,
  isConsumptionAvailable: true,
  medianRunCount: 4,
  medianCostPerRun: 2,
  triggers: [
    {
      triggerId: "trg1",
      name: "Competitor watch",
      kind: "schedule",
      status: "enabled",
      agent: {
        agentId: "agent1",
        name: "deep-dive",
        pictureUrl: null,
        description: null,
        modelId: null,
        modelDisplayName: null,
      },
      editor: {
        name: "Adrien Simon",
        email: "adrien@dust.tt",
        pictureUrl: null,
      },
      scheduleDescription: "Every day at 9:00",
      webhookSourceName: null,
      webhookSourceRestricted: false,
      webhookIcon: null,
      runCount: 8,
      credits: 16,
      executionMode: "user_pool",
    },
  ],
};

function postTriggersRequest(wId: string, body: Record<string, unknown> = {}) {
  return honoApp.request(`/api/w/${wId}/me/automations/triggers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/me/automations/triggers", () => {
  it("returns the caller's own triggers, defaulting to the current cycle", async () => {
    vi.mocked(fetchUserAutomationTriggers).mockResolvedValue(TRIGGERS);
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await postTriggersRequest(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(TRIGGERS);
    expect(vi.mocked(fetchUserAutomationTriggers)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        limit: DEFAULT_AUTOMATION_TRIGGERS_LIMIT,
        offset: 0,
      })
    );
  });

  it("forwards the period, page, search and filter", async () => {
    vi.mocked(fetchUserAutomationTriggers).mockResolvedValue(TRIGGERS);
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await postTriggersRequest(workspace.sId, {
      period: "days",
      days: 7,
      limit: 10,
      offset: 20,
      search: "  competitor  ",
      filter: { agentIds: ["agent1"], kinds: ["schedule"] },
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(fetchUserAutomationTriggers)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        limit: 10,
        offset: 20,
        search: "competitor",
        filter: { agentIds: ["agent1"], kinds: ["schedule"] },
      })
    );
  });

  it("returns 400 on a negative offset", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await postTriggersRequest(workspace.sId, { offset: -1 });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
  });
});
