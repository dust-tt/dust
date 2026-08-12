import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionScopeDimension } from "@app/lib/api/analytics/consumption/scope";
import type { ConsumptionTopGroups } from "@app/lib/api/analytics/consumption/top";
import { fetchConsumptionAllGroups } from "@app/lib/api/analytics/consumption/top";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/analytics/consumption/top"), async (orig) => {
  const mod = await orig();
  return { ...mod, fetchConsumptionAllGroups: vi.fn() };
});
vi.mock(import("@app/lib/api/analytics/consumption/labels"), async (orig) => {
  const mod = await orig();
  return { ...mod, resolveDimensionLabels: vi.fn() };
});

const EMPTY_GROUPS: ConsumptionTopGroups = { groups: [], totalCredits: 0 };

// `fetchConsumptionAllGroups` is called once per dimension (see
// `CONSUMPTION_SCOPE_DIMENSIONS`); default every dimension to empty and let
// the test override the ones it cares about.
function mockGroups(
  overrides: Partial<Record<ConsumptionScopeDimension, ConsumptionTopGroups>>
) {
  vi.mocked(fetchConsumptionAllGroups).mockImplementation(
    async (_auth, { dimension }) => new Ok(overrides[dimension] ?? EMPTY_GROUPS)
  );
}

function mockLabels(labels: Record<string, string>) {
  vi.mocked(resolveDimensionLabels).mockImplementation(
    async (_a, _d, keys) =>
      new Map(
        keys
          .filter((key) => key in labels)
          .map((key) => [key, { name: labels[key], pictureUrl: null }])
      )
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
    mockGroups({
      agent: {
        groups: [{ key: "agent1", credits: 2500, count: 10 }],
        totalCredits: 5000,
      },
    });
    mockLabels({ agent1: "@dust" });
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
    expect(vi.mocked(fetchConsumptionAllGroups)).toHaveBeenCalledTimes(7);
    expect(vi.mocked(fetchConsumptionAllGroups)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dimension: "agent",
        unit: "message",
        filter: undefined,
      })
    );
    expect(vi.mocked(fetchConsumptionAllGroups)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dimension: "tool", unit: "invocation" })
    );
  });

  it("names the attachment after a relative day period", async () => {
    mockGroups({});
    mockLabels({});
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
    vi.mocked(fetchConsumptionAllGroups).mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "boom"))
    );
    const { workspace } = await setupTest();

    const response = await postExportRequest(workspace.sId, {});

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { type: "internal_server_error" },
    });
  });
});
