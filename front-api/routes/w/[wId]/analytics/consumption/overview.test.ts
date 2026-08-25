import type { GetConsumptionOverviewResponse } from "@app/lib/api/analytics/consumption/overview";
import { fetchConsumptionOverview } from "@app/lib/api/analytics/consumption/overview";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/analytics/consumption/overview"), async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    fetchConsumptionOverview: vi.fn(),
  };
});

const OVERVIEW: GetConsumptionOverviewResponse = {
  period: {
    startDate: "2026-07-01T00:00:00.000Z",
    endDate: "2026-07-13T00:00:00.000Z",
  },
  members: { active: 121, total: 130 },
  lastRecordAt: "2026-07-12T23:58:00.000Z",
  totalCredits: 7248,
  topAgent: { agentId: "agent1", name: "dust", credits: 2246 },
  topUser: { userId: "user1", name: "Aubin", credits: 1800 },
  creditUsage: {
    capCredits: 20000,
    status: {
      usedPercentage: 36,
      resetAt: "2026-08-01T00:00:00.000Z",
      target: "on_target",
    },
  },
};

async function setupTest({
  role = "admin",
}: {
  role?: MembershipRoleType;
} = {}) {
  return createPrivateApiMockRequest({ role });
}

function postOverviewRequest(
  wId: string,
  body: Record<string, unknown> = {},
  personal = false
) {
  const analyticsPath = personal ? "me/analytics" : "analytics";
  return honoApp.request(
    `/api/w/${wId}/${analyticsPath}/consumption/overview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function postAgentOverviewRequest(
  workspaceId: string,
  agentId: string,
  body: Record<string, unknown> = {}
) {
  return honoApp.request(
    `/api/w/${workspaceId}/assistant/agent_configurations/${agentId}/analytics/consumption/overview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/w/:wId/analytics/consumption/overview", () => {
  it("returns 403 for non-manager users", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await postOverviewRequest(workspace.sId);

    expect(response.status).toBe(403);
    expect(vi.mocked(fetchConsumptionOverview)).not.toHaveBeenCalled();
  });

  it("lets members read only their own consumption", async () => {
    vi.mocked(fetchConsumptionOverview).mockResolvedValue(new Ok(OVERVIEW));
    const { workspace, user } = await setupTest({ role: "user" });

    const response = await postOverviewRequest(
      workspace.sId,
      { filter: { users: ["another-user"], sources: ["slack"] } },
      true
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(fetchConsumptionOverview)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filter: { users: [user.sId], sources: ["slack"] },
        includeWorkspaceContext: false,
      })
    );
  });

  it("lets editors read only the selected agent's consumption", async () => {
    vi.mocked(fetchConsumptionOverview).mockResolvedValue(new Ok(OVERVIEW));
    const { auth, workspace } = await setupTest({ role: "user" });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const response = await postAgentOverviewRequest(workspace.sId, agent.sId, {
      filter: { agents: ["another-agent"], sources: ["slack"] },
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(fetchConsumptionOverview)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filter: { agents: [agent.sId], sources: ["slack"] },
        includeWorkspaceContext: false,
      })
    );
  });

  it("refuses agent analytics to members who cannot edit the agent", async () => {
    const ownerRequest = await setupTest({ role: "user" });
    const agent = await AgentConfigurationFactory.createTestAgent(
      ownerRequest.auth
    );
    await createPrivateApiMockRequest({
      role: "user",
      workspace: ownerRequest.workspace,
    });
    vi.mocked(fetchConsumptionOverview).mockClear();

    const response = await postAgentOverviewRequest(
      ownerRequest.workspace.sId,
      agent.sId
    );

    expect(response.status).toBe(403);
    expect(vi.mocked(fetchConsumptionOverview)).not.toHaveBeenCalled();
  });

  it("returns the overview for managers, defaulting to the current cycle", async () => {
    vi.mocked(fetchConsumptionOverview).mockResolvedValue(new Ok(OVERVIEW));
    const { workspace } = await setupTest({ role: "admin" });

    const response = await postOverviewRequest(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(OVERVIEW);
    expect(vi.mocked(fetchConsumptionOverview)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        periodInput: { kind: "cycle" },
        filter: {},
      })
    );
  });

  it("forwards a days period and the Explore filter", async () => {
    vi.mocked(fetchConsumptionOverview).mockResolvedValue(new Ok(OVERVIEW));
    const { workspace } = await setupTest();

    const response = await postOverviewRequest(workspace.sId, {
      period: "days",
      days: 7,
      filter: { agents: ["a1"], users: ["u1", "u2"] },
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(fetchConsumptionOverview)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        periodInput: { kind: "days", days: 7 },
        filter: { agents: ["a1"], users: ["u1", "u2"] },
      })
    );
  });

  it("returns 400 on an unknown filter dimension", async () => {
    const { workspace } = await setupTest();

    const response = await postOverviewRequest(workspace.sId, {
      filter: { nope: ["x"] },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
    expect(vi.mocked(fetchConsumptionOverview)).not.toHaveBeenCalled();
  });

  it("returns 500 when the search fails", async () => {
    vi.mocked(fetchConsumptionOverview).mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "boom"))
    );
    const { workspace } = await setupTest();

    const response = await postOverviewRequest(workspace.sId);

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { type: "internal_server_error" },
    });
  });
});
