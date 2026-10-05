import type { GetSlackWorkflowsOverviewResponse } from "@app/lib/api/analytics/slack_workflows/overview";
import { fetchSlackWorkflowsOverview } from "@app/lib/api/analytics/slack_workflows/overview";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  import("@app/lib/api/analytics/slack_workflows/overview"),
  async (orig) => {
    const mod = await orig();
    return {
      ...mod,
      fetchSlackWorkflowsOverview: vi.fn(),
    };
  }
);

const OVERVIEW: GetSlackWorkflowsOverviewResponse = {
  period: {
    startDate: "2026-07-01T00:00:00.000Z",
    endDate: "2026-08-01T00:00:00.000Z",
  },
  slackWorkflowCredits: 1240,
  workspaceTotalCredits: 24000,
};

async function setupTest({
  role = "admin",
  workspace,
}: {
  role?: MembershipRoleType;
  workspace?: WorkspaceType;
} = {}) {
  return createPrivateApiMockRequest({
    role,
    workspace: workspace ?? (await WorkspaceFactory.creditPriced()),
  });
}

function postOverviewRequest(wId: string, body: Record<string, unknown> = {}) {
  return honoApp.request(`/api/w/${wId}/slack-workflows/overview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/slack-workflows/overview", () => {
  it("returns 403 for managers", async () => {
    const { workspace } = await setupTest({ role: "manager" });

    const response = await postOverviewRequest(workspace.sId);

    expect(response.status).toBe(403);
    expect(vi.mocked(fetchSlackWorkflowsOverview)).not.toHaveBeenCalled();
  });

  it("returns 403 on a plan that is not credit-priced", async () => {
    const { workspace } = await setupTest({
      workspace: await WorkspaceFactory.basic(),
    });

    const response = await postOverviewRequest(workspace.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "plan_limit_error" },
    });
    expect(vi.mocked(fetchSlackWorkflowsOverview)).not.toHaveBeenCalled();
  });

  it("returns the overview for admins", async () => {
    vi.mocked(fetchSlackWorkflowsOverview).mockResolvedValue(new Ok(OVERVIEW));
    const { workspace } = await setupTest();

    const response = await postOverviewRequest(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(OVERVIEW);
  });

  it("returns 500 when the search fails", async () => {
    vi.mocked(fetchSlackWorkflowsOverview).mockResolvedValue(
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
