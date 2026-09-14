import type { GetAutomationTriggerBreakdownResponse } from "@app/lib/api/analytics/automations/breakdown";
import { fetchAutomationTriggerBreakdown } from "@app/lib/api/analytics/automations/breakdown";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  import("@app/lib/api/analytics/automations/breakdown"),
  async (orig) => {
    const mod = await orig();
    return {
      ...mod,
      fetchAutomationTriggerBreakdown: vi.fn(),
    };
  }
);

const BREAKDOWN: GetAutomationTriggerBreakdownResponse = {
  period: {
    startDate: "2026-07-01T00:00:00.000Z",
    endDate: "2026-08-01T00:00:00.000Z",
  },
  creditDestination: {
    dimension: "tool",
    key: "web_search_browse",
    name: "Web search browse",
    icon: null,
    credits: 2154,
    share: 0.88,
  },
};

async function setupTest({
  role = "admin",
}: {
  role?: MembershipRoleType;
} = {}) {
  return createPrivateApiMockRequest({ role });
}

function postBreakdownRequest(wId: string, tId: string) {
  return honoApp.request(
    `/api/w/${wId}/analytics/automations/triggers/${tId}/breakdown`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }
  );
}

describe("POST /api/w/:wId/analytics/automations/triggers/:tId/breakdown", () => {
  it("returns 403 for regular users", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await postBreakdownRequest(workspace.sId, "trg1");

    expect(response.status).toBe(403);
    expect(vi.mocked(fetchAutomationTriggerBreakdown)).not.toHaveBeenCalled();
  });

  it("returns the breakdown for managers", async () => {
    vi.mocked(fetchAutomationTriggerBreakdown).mockResolvedValue(
      new Ok(BREAKDOWN)
    );
    const { workspace } = await setupTest({ role: "manager" });

    const response = await postBreakdownRequest(workspace.sId, "trg1");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(BREAKDOWN);
  });

  it("returns the breakdown for admins", async () => {
    vi.mocked(fetchAutomationTriggerBreakdown).mockResolvedValue(
      new Ok(BREAKDOWN)
    );
    const { workspace } = await setupTest();

    const response = await postBreakdownRequest(workspace.sId, "trg1");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(BREAKDOWN);
    expect(vi.mocked(fetchAutomationTriggerBreakdown)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ triggerId: "trg1" })
    );
  });

  it("returns 500 when the search fails", async () => {
    vi.mocked(fetchAutomationTriggerBreakdown).mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "boom"))
    );
    const { workspace } = await setupTest();

    const response = await postBreakdownRequest(workspace.sId, "trg1");

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { type: "internal_server_error" },
    });
  });
});
