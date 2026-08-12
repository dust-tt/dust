import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  fetchConsumptionTopAgents,
  type GetConsumptionTopAgentsResponse,
} from "@app/lib/api/analytics/consumption/top_agents";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  import("@app/lib/api/analytics/consumption/top_agents"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchConsumptionTopAgents: vi.fn() };
  }
);

const PERIOD: ConsumptionPeriod = {
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-08-01T00:00:00.000Z",
};

const TOP_AGENTS: GetConsumptionTopAgentsResponse = {
  period: PERIOD,
  totalCredits: 5000,
  agents: [
    {
      agentId: "agent1",
      name: "@dust",
      pictureUrl: null,
      credits: 2500,
      messageCount: 10,
      avgCreditsPerMessage: 250,
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

function postExportRequest(wId: string, body: Record<string, unknown>) {
  return honoApp.request(`/api/w/${wId}/analytics/consumption/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/analytics/consumption/export", () => {
  it("returns the toggled dimension's breakdown as a CSV attachment", async () => {
    vi.mocked(fetchConsumptionTopAgents).mockResolvedValue(new Ok(TOP_AGENTS));
    const { workspace } = await setupTest({ role: "admin" });

    const response = await postExportRequest(workspace.sId, {
      dimension: "agent",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain(
      'filename="dust_consumption_agent.csv"'
    );
    const csv = await response.text();
    expect(csv).toContain("name,costSharePercent,credits,avgCredits");
    expect(csv).toContain("@dust,50,2500,250");
    expect(vi.mocked(fetchConsumptionTopAgents)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 1000, filter: undefined })
    );
  });

  it("is refused to non-managers", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await postExportRequest(workspace.sId, {
      dimension: "agent",
    });

    expect(response.status).toBe(403);
  });

  it("returns 400 for an unknown dimension", async () => {
    const { workspace } = await setupTest();

    const response = await postExportRequest(workspace.sId, {
      dimension: "not-a-dimension",
    });

    expect(response.status).toBe(400);
  });

  it("returns 500 when the search fails", async () => {
    vi.mocked(fetchConsumptionTopAgents).mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "boom"))
    );
    const { workspace } = await setupTest();

    const response = await postExportRequest(workspace.sId, {
      dimension: "agent",
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { type: "internal_server_error" },
    });
  });
});
