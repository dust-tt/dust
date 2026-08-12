import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import {
  fetchConsumptionTopAgents,
  type GetConsumptionTopAgentsResponse,
} from "@app/lib/api/analytics/consumption/top_agents";
import { fetchConsumptionTopGroups } from "@app/lib/api/analytics/consumption/top_groups";
import { fetchConsumptionTopModels } from "@app/lib/api/analytics/consumption/top_models";
import { fetchConsumptionTopSkills } from "@app/lib/api/analytics/consumption/top_skills";
import { fetchConsumptionTopSources } from "@app/lib/api/analytics/consumption/top_sources";
import { fetchConsumptionTopTools } from "@app/lib/api/analytics/consumption/top_tools";
import { fetchConsumptionTopUsers } from "@app/lib/api/analytics/consumption/top_users";
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
vi.mock(
  import("@app/lib/api/analytics/consumption/top_users"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchConsumptionTopUsers: vi.fn() };
  }
);
vi.mock(
  import("@app/lib/api/analytics/consumption/top_groups"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchConsumptionTopGroups: vi.fn() };
  }
);
vi.mock(
  import("@app/lib/api/analytics/consumption/top_models"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchConsumptionTopModels: vi.fn() };
  }
);
vi.mock(
  import("@app/lib/api/analytics/consumption/top_tools"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchConsumptionTopTools: vi.fn() };
  }
);
vi.mock(
  import("@app/lib/api/analytics/consumption/top_skills"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchConsumptionTopSkills: vi.fn() };
  }
);
vi.mock(
  import("@app/lib/api/analytics/consumption/top_sources"),
  async (orig) => {
    const mod = await orig();
    return { ...mod, fetchConsumptionTopSources: vi.fn() };
  }
);

const PERIOD: ConsumptionPeriod = {
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-08-01T00:00:00.000Z",
};

const EMPTY_RESULT = { period: PERIOD, totalCredits: 0 };

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

function mockOtherDimensionsEmpty() {
  vi.mocked(fetchConsumptionTopUsers).mockResolvedValue(
    new Ok({ ...EMPTY_RESULT, users: [] })
  );
  vi.mocked(fetchConsumptionTopGroups).mockResolvedValue(
    new Ok({ ...EMPTY_RESULT, groups: [] })
  );
  vi.mocked(fetchConsumptionTopModels).mockResolvedValue(
    new Ok({ ...EMPTY_RESULT, models: [] })
  );
  vi.mocked(fetchConsumptionTopTools).mockResolvedValue(
    new Ok({ ...EMPTY_RESULT, tools: [] })
  );
  vi.mocked(fetchConsumptionTopSkills).mockResolvedValue(
    new Ok({ ...EMPTY_RESULT, skills: [] })
  );
  vi.mocked(fetchConsumptionTopSources).mockResolvedValue(
    new Ok({ ...EMPTY_RESULT, sources: [] })
  );
}

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
  it("returns the breakdown for every dimension as a single CSV attachment", async () => {
    vi.mocked(fetchConsumptionTopAgents).mockResolvedValue(new Ok(TOP_AGENTS));
    mockOtherDimensionsEmpty();
    const { workspace } = await setupTest({ role: "admin" });

    const response = await postExportRequest(workspace.sId, {});

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toMatch(
      /filename="dust_consumption_export_ongoing_cycle_date_\d{4}-\d{2}-\d{2}\.csv"/
    );
    const csv = await response.text();
    expect(csv).toContain("dimension,name,costSharePercent,credits,avgCredits");
    expect(csv).toContain("agent,'@dust,50,2500,250");
    expect(vi.mocked(fetchConsumptionTopAgents)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 1000, filter: undefined })
    );
  });

  it("names the attachment after a relative day period", async () => {
    vi.mocked(fetchConsumptionTopAgents).mockResolvedValue(new Ok(TOP_AGENTS));
    mockOtherDimensionsEmpty();
    const { workspace } = await setupTest({ role: "admin" });

    const response = await postExportRequest(workspace.sId, {
      period: "days",
      days: 7,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain(
      'filename="dust_consumption_export_last_7_days.csv"'
    );
  });

  it("is refused to non-managers", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await postExportRequest(workspace.sId, {});

    expect(response.status).toBe(403);
  });

  it("returns 400 for an invalid body", async () => {
    const { workspace } = await setupTest();

    const response = await postExportRequest(workspace.sId, {
      days: "not-a-number",
    });

    expect(response.status).toBe(400);
  });

  it("returns 500 when a dimension search fails", async () => {
    vi.mocked(fetchConsumptionTopAgents).mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "boom"))
    );
    mockOtherDimensionsEmpty();
    const { workspace } = await setupTest();

    const response = await postExportRequest(workspace.sId, {});

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { type: "internal_server_error" },
    });
  });
});
