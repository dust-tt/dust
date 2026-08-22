import type { GetAutomationTriggerBreakdownResponse } from "@app/lib/api/analytics/automations/breakdown";
import { fetchAutomationTriggerBreakdown } from "@app/lib/api/analytics/automations/breakdown";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  import("@app/lib/api/analytics/automations/breakdown"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchAutomationTriggerBreakdown: vi.fn() };
  }
);

const BREAKDOWN: GetAutomationTriggerBreakdownResponse = {
  period: {
    startDate: "2026-07-01T00:00:00.000Z",
    endDate: "2026-08-01T00:00:00.000Z",
  },
  creditDestination: {
    dimension: "model",
    key: "claude-opus-5",
    name: "Claude Opus 5",
    icon: null,
    credits: 12,
    share: 0.75,
  },
};

function postBreakdownRequest(wId: string, body: Record<string, unknown>) {
  return honoApp.request(`/api/w/${wId}/me/automations/trigger-breakdown`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function scheduleTrigger(
  auth: Authenticator,
  agentConfigurationId: string
) {
  return TriggerFactory.schedule(auth, {
    agentConfigurationId,
    name: "Competitor watch",
    configuration: { cron: "0 9 * * *", timezone: "UTC" },
  });
}

describe("POST /api/w/:wId/me/automations/trigger-breakdown", () => {
  it("returns the breakdown of a trigger the caller edits", async () => {
    vi.mocked(fetchAutomationTriggerBreakdown).mockResolvedValue(
      new Ok(BREAKDOWN)
    );
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await scheduleTrigger(auth, agent.sId);

    const response = await postBreakdownRequest(workspace.sId, {
      triggerId: trigger.sId,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(BREAKDOWN);
  });

  it("returns 404 for a trigger edited by another member", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );
    const theirTrigger = await scheduleTrigger(otherAuth, agent.sId);

    const response = await postBreakdownRequest(workspace.sId, {
      triggerId: theirTrigger.sId,
    });

    expect(response.status).toBe(404);
    expect(vi.mocked(fetchAutomationTriggerBreakdown)).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown trigger", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await postBreakdownRequest(workspace.sId, {
      triggerId: "trg_does_not_exist",
    });

    expect(response.status).toBe(404);
    expect(vi.mocked(fetchAutomationTriggerBreakdown)).not.toHaveBeenCalled();
  });
});
