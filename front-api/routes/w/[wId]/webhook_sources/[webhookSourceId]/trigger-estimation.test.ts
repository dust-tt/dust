import { makeSId } from "@app/lib/resources/string_ids";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WebhookSourceFactory } from "@app/tests/utils/WebhookSourceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupTest(role: MembershipRoleType = "admin") {
  const { workspace, auth } = await createPrivateApiMockRequest({ role });
  return { workspace, auth };
}

function getEstimation(
  wId: string,
  webhookSourceId: string,
  params: Record<string, string> = {}
) {
  const qs = new URLSearchParams(params).toString();
  const suffix = qs.length > 0 ? `?${qs}` : "";
  return honoApp.request(
    `/api/w/${wId}/webhook_sources/${webhookSourceId}/trigger-estimation${suffix}`
  );
}

describe("GET /api/w/[wId]/webhook_sources/[webhookSourceId]/trigger-estimation", () => {
  it("should return matching/total counts for an existing webhook source", async () => {
    const { workspace } = await setupTest();
    const webhookSource = await new WebhookSourceFactory(workspace).create({
      name: "Test Source",
    });

    const response = await getEstimation(workspace.sId, webhookSource.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(typeof data.matchingCount).toBe("number");
    expect(typeof data.totalCount).toBe("number");
  });

  it("should accept event query parameter", async () => {
    const { workspace } = await setupTest();
    const webhookSource = await new WebhookSourceFactory(workspace).create({
      name: "Test Source 2",
    });

    const response = await getEstimation(workspace.sId, webhookSource.sId, {
      event: "pull_request",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(typeof data.matchingCount).toBe("number");
    expect(typeof data.totalCount).toBe("number");
  });

  it("should return 404 when webhook source does not exist", async () => {
    const { workspace } = await setupTest();
    const fakeSId = makeSId("webhook_source", {
      id: 999999,
      workspaceId: workspace.id,
    });

    const response = await getEstimation(workspace.sId, fakeSId);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error.type).toBe("webhook_source_not_found");
  });
});
