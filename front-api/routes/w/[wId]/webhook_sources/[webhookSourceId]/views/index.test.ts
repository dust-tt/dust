import { makeSId } from "@app/lib/resources/string_ids";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WebhookSourceFactory } from "@app/tests/utils/WebhookSourceFactory";
import { WebhookSourceViewFactory } from "@app/tests/utils/WebhookSourceViewFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupTest(role: MembershipRoleType = "admin") {
  const { workspace, auth, globalSpace, systemSpace } =
    await createPrivateApiMockRequest({ role });
  return { workspace, auth, globalSpace, systemSpace };
}

function listViews(wId: string, webhookSourceId: string) {
  return honoApp.request(
    `/api/w/${wId}/webhook_sources/${webhookSourceId}/views`
  );
}

describe("GET /api/w/[wId]/webhook_sources/[webhookSourceId]/views", () => {
  it("should return the system view created with the webhook source", async () => {
    const { workspace } = await setupTest();
    const webhookSource = await new WebhookSourceFactory(workspace).create({
      name: "Test Source",
    });

    const response = await listViews(workspace.sId, webhookSource.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.views)).toBe(true);
    expect(data.views.length).toBeGreaterThanOrEqual(1);
    for (const view of data.views) {
      expect(view.webhookSource.sId).toBe(webhookSource.sId);
    }
  });

  it("should return all views for the source across multiple spaces", async () => {
    const { workspace, globalSpace, systemSpace } = await setupTest();
    const factory = new WebhookSourceViewFactory(workspace);
    const systemView = await factory.create(systemSpace);
    const globalView = await factory.create(globalSpace, {
      webhookSourceId: systemView.webhookSource.sId,
    });

    const response = await listViews(
      workspace.sId,
      systemView.webhookSource.sId
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    const sIds = data.views.map((v: { sId: string }) => v.sId);
    expect(sIds).toContain(systemView.sId);
    expect(sIds).toContain(globalView.sId);
  });

  it("should return 404 when webhook source does not exist", async () => {
    const { workspace } = await setupTest();
    const fakeSId = makeSId("webhook_source", {
      id: 999999,
      workspaceId: workspace.id,
    });

    const response = await listViews(workspace.sId, fakeSId);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error.type).toBe("webhook_source_not_found");
  });
});
