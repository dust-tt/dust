import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WebhookSourceViewFactory } from "@app/tests/utils/WebhookSourceViewFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupTest(role: MembershipRoleType = "admin") {
  const { workspace, auth, systemSpace, globalSpace } =
    await createPrivateApiMockRequest({ role });
  return { workspace, auth, systemSpace, globalSpace };
}

function listViews(wId: string, spaceIds: string | undefined) {
  const search =
    spaceIds === undefined
      ? ""
      : `?${new URLSearchParams({ spaceIds }).toString()}`;
  return honoApp.request(`/api/w/${wId}/webhook_sources/views${search}`);
}

describe("GET /api/w/[wId]/webhook_sources/views", () => {
  it("should return 400 when spaceIds query param is missing", async () => {
    const { workspace } = await setupTest();

    const response = await listViews(workspace.sId, undefined);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.type).toBe("invalid_request_error");
  });

  it("should return views in the requested space", async () => {
    const { workspace, globalSpace } = await setupTest();

    const factory = new WebhookSourceViewFactory(workspace);
    await factory.create(globalSpace);
    await factory.create(globalSpace);

    const response = await listViews(workspace.sId, globalSpace.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.webhookSourceViews.length).toBeGreaterThanOrEqual(2);
    for (const view of data.webhookSourceViews) {
      expect(view.spaceId).toBe(globalSpace.sId);
    }
  });

  it("should return empty array when spaceIds is empty string", async () => {
    const { workspace, globalSpace } = await setupTest();
    const factory = new WebhookSourceViewFactory(workspace);
    await factory.create(globalSpace);

    const response = await listViews(workspace.sId, "");

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.webhookSourceViews).toEqual([]);
  });

  it("should filter out spaces the user cannot access", async () => {
    const { workspace, globalSpace } = await setupTest("user");

    const factory = new WebhookSourceViewFactory(workspace);
    await factory.create(globalSpace);

    const restrictedSpace = await SpaceFactory.regular(workspace);
    await factory.create(restrictedSpace);

    const response = await listViews(
      workspace.sId,
      `${globalSpace.sId},${restrictedSpace.sId}`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    for (const view of data.webhookSourceViews) {
      expect(view.spaceId).toBe(globalSpace.sId);
    }
  });

  it("should aggregate views across multiple readable spaces", async () => {
    const { workspace, globalSpace, systemSpace } = await setupTest();
    const factory = new WebhookSourceViewFactory(workspace);
    const globalView = await factory.create(globalSpace);
    const systemView = await factory.create(systemSpace);

    const response = await listViews(
      workspace.sId,
      `${globalSpace.sId},${systemSpace.sId}`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    const spaceIds = new Set<string>(
      data.webhookSourceViews.map((v: { spaceId: string }) => v.spaceId)
    );
    expect(spaceIds.has(globalSpace.sId)).toBe(true);
    expect(spaceIds.has(systemSpace.sId)).toBe(true);
    const ids = data.webhookSourceViews.map((v: { sId: string }) => v.sId);
    expect(ids).toContain(globalView.sId);
    expect(ids).toContain(systemView.sId);
  });
});
