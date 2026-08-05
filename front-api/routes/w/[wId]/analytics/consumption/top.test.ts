import { fetchConsumptionTop } from "@app/lib/api/analytics/consumption/top";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

// devModeConstants reads localStorage at module load. jsdom does not always
// have localStorage initialized when mock factories evaluate, which crashes
// any test whose mocked lib transitively imports AuthContext. Stub it here.
vi.mock("@app/components/dev/devModeConstants", () => ({
  DEV_MODE_STORAGE_KEY: "dust_dev_mode",
  DEV_MODE_ACTIVE: false,
}));

vi.mock(import("@app/lib/api/analytics/consumption/top"), async (orig) => {
  const mod = await orig();
  return { ...mod, fetchConsumptionTop: vi.fn() };
});

const TOP = {
  dimension: "agent" as const,
  unit: "message" as const,
  totalCredits: 5000,
  rows: [
    {
      id: "agent1",
      name: "@dust",
      pictureUrl: null,
      credits: 2230,
      count: 10,
      avgCreditPerUnit: 223,
    },
  ],
};

async function setupTest({ role = "admin" as MembershipRoleType } = {}) {
  return createPrivateApiMockRequest({ role });
}

function getTopRequest(wId: string, query: Record<string, string> = {}) {
  const qs = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/w/${wId}/analytics/consumption/top${qs ? `?${qs}` : ""}`
  );
}

describe("GET /api/w/:wId/analytics/consumption/top", () => {
  it("returns 403 for non-manager users", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await getTopRequest(workspace.sId, { dimension: "agent" });

    expect(response.status).toBe(403);
    expect(vi.mocked(fetchConsumptionTop)).not.toHaveBeenCalled();
  });

  it("returns the ranking for managers", async () => {
    vi.mocked(fetchConsumptionTop).mockResolvedValue(new Ok(TOP));
    const { workspace } = await setupTest({ role: "admin" });

    const response = await getTopRequest(workspace.sId, { dimension: "agent" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(TOP);
    expect(vi.mocked(fetchConsumptionTop)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dimension: "agent",
        limit: 10,
        period: expect.objectContaining({ kind: "cycle" }),
        filter: undefined,
      })
    );
  });

  it("forwards dimension, limit, period and filter", async () => {
    vi.mocked(fetchConsumptionTop).mockResolvedValue(
      new Ok({ ...TOP, dimension: "tool", unit: "tool_call" })
    );
    const { workspace } = await setupTest();

    const response = await getTopRequest(workspace.sId, {
      dimension: "tool",
      limit: "5",
      period: "days",
      days: "7",
      filter: JSON.stringify({ agent: ["a1"] }),
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(fetchConsumptionTop)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dimension: "tool",
        limit: 5,
        period: expect.objectContaining({ kind: "days" }),
        filter: { agent: ["a1"] },
      })
    );
  });

  it("returns 400 when dimension is missing", async () => {
    const { workspace } = await setupTest();

    const response = await getTopRequest(workspace.sId);

    expect(response.status).toBe(400);
    expect(vi.mocked(fetchConsumptionTop)).not.toHaveBeenCalled();
  });

  it("returns 400 on an unknown dimension", async () => {
    const { workspace } = await setupTest();

    const response = await getTopRequest(workspace.sId, {
      dimension: "conversation",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
    expect(vi.mocked(fetchConsumptionTop)).not.toHaveBeenCalled();
  });

  it("returns 500 when the search fails", async () => {
    vi.mocked(fetchConsumptionTop).mockResolvedValue(
      new Err(
        Object.assign(new Error("boom"), { type: "query_error" as const })
      )
    );
    const { workspace } = await setupTest();

    const response = await getTopRequest(workspace.sId, { dimension: "agent" });

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { type: "internal_server_error" },
    });
  });
});
