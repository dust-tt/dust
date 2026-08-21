import type { GetAutomationsOverviewResponse } from "@app/lib/api/analytics/automations/overview";
import { fetchAutomationsOverview } from "@app/lib/api/analytics/automations/overview";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/analytics/automations/overview"), async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    fetchAutomationsOverview: vi.fn(),
  };
});

const OVERVIEW: GetAutomationsOverviewResponse = {
  period: {
    startDate: "2026-07-01T00:00:00.000Z",
    endDate: "2026-08-01T00:00:00.000Z",
  },
  automationCredits: 8453,
  workspaceTotalCredits: 24000,
  triggers: {
    enabled: 142,
    total: 152,
  },
};

async function setupTest({
  role = "admin",
}: {
  role?: MembershipRoleType;
} = {}) {
  return createPrivateApiMockRequest({ role });
}

function postOverviewRequest(wId: string, body: Record<string, unknown> = {}) {
  return honoApp.request(`/api/w/${wId}/analytics/automations/overview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/analytics/automations/overview", () => {
  it("returns 403 for regular users", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await postOverviewRequest(workspace.sId);

    expect(response.status).toBe(403);
    expect(vi.mocked(fetchAutomationsOverview)).not.toHaveBeenCalled();
  });

  it("returns the overview for managers", async () => {
    vi.mocked(fetchAutomationsOverview).mockResolvedValue(new Ok(OVERVIEW));
    const { workspace } = await setupTest({ role: "manager" });

    const response = await postOverviewRequest(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(OVERVIEW);
  });

  it("returns the overview for admins, defaulting to the current cycle", async () => {
    vi.mocked(fetchAutomationsOverview).mockResolvedValue(new Ok(OVERVIEW));
    const { workspace } = await setupTest();

    const response = await postOverviewRequest(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(OVERVIEW);
  });

  it("returns 400 on a negative days period", async () => {
    const { workspace } = await setupTest();

    const response = await postOverviewRequest(workspace.sId, {
      period: "days",
      days: -7,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
    expect(vi.mocked(fetchAutomationsOverview)).not.toHaveBeenCalled();
  });

  it("returns 500 when the search fails", async () => {
    vi.mocked(fetchAutomationsOverview).mockResolvedValue(
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
