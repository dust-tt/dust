import type { GetConsumptionTimeseriesResponse } from "@app/lib/api/analytics/consumption/timeseries";
import { fetchConsumptionTimeseries } from "@app/lib/api/analytics/consumption/timeseries";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  import("@app/lib/api/analytics/consumption/timeseries"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchConsumptionTimeseries: vi.fn() };
  }
);

const TIMESERIES: GetConsumptionTimeseriesResponse = {
  period: {
    startDate: "2026-07-01T00:00:00.000Z",
    endDate: "2026-08-01T00:00:00.000Z",
  },
  granularity: "day",
  mode: "period",
  metric: "credit_micro",
  timezone: "UTC",
  breakdownBy: null,
  workspaceMemberCount: 10,
  groups: [{ groupKey: "total", name: "Total" }],
  points: [],
};

function postTimeseriesRequest(
  workspaceId: string,
  body: Record<string, unknown> = {},
  personal = false
) {
  const analyticsPath = personal ? "me/analytics" : "analytics";
  return honoApp.request(
    `/api/w/${workspaceId}/${analyticsPath}/consumption/timeseries`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function postAgentTimeseriesRequest(
  workspaceId: string,
  agentId: string,
  body: Record<string, unknown> = {}
) {
  return honoApp.request(
    `/api/w/${workspaceId}/assistant/agent_configurations/${agentId}/analytics/consumption/timeseries`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/w/:wId/analytics/consumption/timeseries", () => {
  it("keeps the workspace view manager-only", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await postTimeseriesRequest(workspace.sId);

    expect(response.status).toBe(403);
    expect(vi.mocked(fetchConsumptionTimeseries)).not.toHaveBeenCalled();
  });

  it("lets members read only their own timeseries", async () => {
    vi.mocked(fetchConsumptionTimeseries).mockResolvedValue(new Ok(TIMESERIES));
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "user",
    });

    const response = await postTimeseriesRequest(
      workspace.sId,
      { filter: { users: ["another-user"], models: ["model-1"] } },
      true
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(fetchConsumptionTimeseries)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filter: { users: [user.sId], models: ["model-1"] },
      })
    );
  });

  it.each([
    "user",
    "group",
  ] as const)("rejects the %s breakdown in personal analytics", async (breakdownBy) => {
    vi.mocked(fetchConsumptionTimeseries).mockClear();
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await postTimeseriesRequest(
      workspace.sId,
      { breakdownBy },
      true
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
    expect(vi.mocked(fetchConsumptionTimeseries)).not.toHaveBeenCalled();
  });

  it("lets editors read only the selected agent's timeseries", async () => {
    vi.mocked(fetchConsumptionTimeseries).mockResolvedValue(new Ok(TIMESERIES));
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const response = await postAgentTimeseriesRequest(
      workspace.sId,
      agent.sId,
      { filter: { agents: ["another-agent"], models: ["model-1"] } }
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(fetchConsumptionTimeseries)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filter: { agents: [agent.sId], models: ["model-1"] },
      })
    );
  });

  it("rejects the agent breakdown when the route already fixes the agent", async () => {
    vi.mocked(fetchConsumptionTimeseries).mockClear();
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const response = await postAgentTimeseriesRequest(
      workspace.sId,
      agent.sId,
      { breakdownBy: "agent" }
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
    expect(vi.mocked(fetchConsumptionTimeseries)).not.toHaveBeenCalled();
  });
});
