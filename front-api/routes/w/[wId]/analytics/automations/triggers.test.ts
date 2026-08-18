import { DEFAULT_AUTOMATION_TRIGGERS_LIMIT } from "@app/lib/api/analytics/automations/schema";
import type { GetAutomationTriggersResponse } from "@app/lib/api/analytics/automations/triggers";
import { fetchAutomationTriggers } from "@app/lib/api/analytics/automations/triggers";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/analytics/automations/triggers"), async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    fetchAutomationTriggers: vi.fn(),
  };
});

const TRIGGERS: GetAutomationTriggersResponse = {
  period: {
    startDate: "2026-07-01T00:00:00.000Z",
    endDate: "2026-08-01T00:00:00.000Z",
  },
  totalCount: 2,
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
        description: "Watches the competition.",
        modelId: "claude-opus-5",
        modelDisplayName: "Claude Opus 5",
      },
      editor: {
        name: "Nic Siegle",
        email: "nic@dust.tt",
        pictureUrl: null,
      },
      scheduleDescription: "Every day at 9:00",
      webhookSourceName: null,
      webhookSourceRestricted: false,
      webhookIcon: null,
      runCount: 720,
      credits: 2448,
    },
    {
      triggerId: "trg2",
      name: "Inbound triage",
      kind: "webhook",
      status: "disabled",
      agent: {
        agentId: "agent2",
        name: "support",
        pictureUrl: null,
        description: "Triages inbound requests.",
        modelId: "claude-opus-5",
        modelDisplayName: "Claude Opus 5",
      },
      editor: {
        name: "Adrien Simon",
        email: "adrien@dust.tt",
        pictureUrl: null,
      },
      scheduleDescription: null,
      webhookSourceName: "Gmail",
      webhookSourceRestricted: false,
      webhookIcon: "ActionFlagIcon",
      runCount: 12,
      credits: 48,
    },
  ],
};

async function setupTest({
  role = "admin",
}: {
  role?: MembershipRoleType;
} = {}) {
  return createPrivateApiMockRequest({ role });
}

function postTriggersRequest(wId: string, body: Record<string, unknown> = {}) {
  return honoApp.request(`/api/w/${wId}/analytics/automations/triggers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/analytics/automations/triggers", () => {
  it("returns 403 for regular users", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await postTriggersRequest(workspace.sId);

    expect(response.status).toBe(403);
    expect(vi.mocked(fetchAutomationTriggers)).not.toHaveBeenCalled();
  });

  it("returns the triggers for managers, defaulting to the current cycle", async () => {
    vi.mocked(fetchAutomationTriggers).mockResolvedValue(new Ok(TRIGGERS));
    const { workspace } = await setupTest({ role: "manager" });

    const response = await postTriggersRequest(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(TRIGGERS);
    expect(vi.mocked(fetchAutomationTriggers)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        limit: DEFAULT_AUTOMATION_TRIGGERS_LIMIT,
        offset: 0,
      })
    );
  });

  it("returns the triggers for admins, defaulting to the current cycle", async () => {
    vi.mocked(fetchAutomationTriggers).mockResolvedValue(new Ok(TRIGGERS));
    const { workspace } = await setupTest();

    const response = await postTriggersRequest(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(TRIGGERS);
    expect(vi.mocked(fetchAutomationTriggers)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        limit: DEFAULT_AUTOMATION_TRIGGERS_LIMIT,
        offset: 0,
      })
    );
  });

  it("forwards a days period and the requested page", async () => {
    vi.mocked(fetchAutomationTriggers).mockResolvedValue(new Ok(TRIGGERS));
    const { workspace } = await setupTest();

    const response = await postTriggersRequest(workspace.sId, {
      period: "days",
      days: 7,
      limit: 10,
      offset: 20,
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(fetchAutomationTriggers)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 10, offset: 20 })
    );
  });

  it("returns 400 on a negative offset", async () => {
    const { workspace } = await setupTest();

    const response = await postTriggersRequest(workspace.sId, { offset: -1 });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
    expect(vi.mocked(fetchAutomationTriggers)).not.toHaveBeenCalled();
  });

  it("returns 500 when the search fails", async () => {
    vi.mocked(fetchAutomationTriggers).mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "boom"))
    );
    const { workspace } = await setupTest();

    const response = await postTriggersRequest(workspace.sId);

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { type: "internal_server_error" },
    });
  });
});
