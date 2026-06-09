import { Authenticator } from "@app/lib/auth";
import { makeSId } from "@app/lib/resources/string_ids";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WebhookSourceFactory } from "@app/tests/utils/WebhookSourceFactory";
import { WebhookSourceViewFactory } from "@app/tests/utils/WebhookSourceViewFactory";
import { honoApp } from "@front-api/app";
import { ENSURE_IS_ADMIN_ERROR_MESSAGE } from "@front-api/middlewares/ensure_role";
import { describe, expect, it } from "vitest";

function listViews(workspace: { sId: string }, spaceId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/${spaceId}/webhook_source_views`
  );
}

function createView(
  workspace: { sId: string },
  spaceId: string,
  body: unknown
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/${spaceId}/webhook_source_views`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function deleteView(
  workspace: { sId: string },
  spaceId: string,
  viewId: string
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/${spaceId}/webhook_source_views/${viewId}`,
    { method: "DELETE" }
  );
}

describe("GET /api/w/:wId/spaces/:spaceId/webhook_source_views", () => {
  it("returns webhook source views for system space", async () => {
    const { workspace, systemSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const response = await listViews(workspace, systemSpace.sId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      success: true,
      webhookSourceViews: expect.any(Array),
    });
  });

  it("returns webhook source views for regular space", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    const regularSpace = await SpaceFactory.regular(workspace);
    const factory = new WebhookSourceViewFactory(workspace);
    await factory.create(regularSpace);

    const response = await listViews(workspace, regularSpace.sId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      success: true,
      webhookSourceViews: expect.any(Array),
    });
  });
});

describe("POST /api/w/:wId/spaces/:spaceId/webhook_source_views", () => {
  it("creates a webhook source view in a regular space (admin)", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    const regularSpace = await SpaceFactory.regular(workspace);

    const factory = new WebhookSourceFactory(workspace);
    const webhookSource = await factory.create();

    const response = await createView(workspace, regularSpace.sId, {
      webhookSourceId: webhookSource.sId,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      success: true,
      webhookSourceView: expect.objectContaining({
        sId: expect.any(String),
        spaceId: regularSpace.sId,
        webhookSource: expect.objectContaining({
          sId: webhookSource.sId,
        }),
      }),
    });
  });

  it("creates a webhook source view in the global space", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const factory = new WebhookSourceFactory(workspace);
    const webhookSource = await factory.create();

    const response = await createView(workspace, globalSpace.sId, {
      webhookSourceId: webhookSource.sId,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      success: true,
      webhookSourceView: expect.objectContaining({
        sId: expect.any(String),
        spaceId: globalSpace.sId,
        webhookSource: expect.objectContaining({
          sId: webhookSource.sId,
        }),
      }),
    });
  });

  it("returns 403 when user is not admin", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "builder",
    });
    const regularSpace = await SpaceFactory.regular(workspace);

    const factory = new WebhookSourceFactory(workspace);
    const webhookSource = await factory.create();

    const response = await createView(workspace, regularSpace.sId, {
      webhookSourceId: webhookSource.sId,
    });

    expect(response.status).toBe(403);
  });

  it("returns 400 for invalid request body", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    const regularSpace = await SpaceFactory.regular(workspace);

    const response = await createView(workspace, regularSpace.sId, {});

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.type).toBe("invalid_request_error");
  });

  it("returns 400 for invalid space type (system)", async () => {
    const { workspace, systemSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const factory = new WebhookSourceFactory(workspace);
    const webhookSource = await factory.create();

    const response = await createView(workspace, systemSpace.sId, {
      webhookSourceId: webhookSource.sId,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "Can only create webhook source views from regular or global spaces.",
      },
    });
  });

  it("returns 400 when webhook source system view doesn't exist", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    const regularSpace = await SpaceFactory.regular(workspace);

    const response = await createView(workspace, regularSpace.sId, {
      webhookSourceId: "9999",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "Missing system view for webhook source, it should have been created when adding the webhook source.",
      },
    });
  });
});

describe("DELETE /api/w/:wId/spaces/:spaceId/webhook_source_views/:webhookSourceViewId", () => {
  it("deletes a webhook source view", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const regularSpace = await SpaceFactory.regular(workspace);

    const factory = new WebhookSourceViewFactory(workspace);
    const view = await factory.create(regularSpace);

    const response = await deleteView(workspace, regularSpace.sId, view.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });

    const deleted = await WebhookSourcesViewResource.fetchById(auth, view.sId);
    expect(deleted).toBe(null);
  });

  it("deletes a webhook source view from the global space", async () => {
    const { workspace, auth, globalSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const factory = new WebhookSourceViewFactory(workspace);
    const view = await factory.create(globalSpace);

    const response = await deleteView(workspace, globalSpace.sId, view.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });

    const deleted = await WebhookSourcesViewResource.fetchById(auth, view.sId);
    expect(deleted).toBe(null);
  });

  it("returns 403 when user is not admin", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "builder",
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const regularSpace = await SpaceFactory.regular(workspace);
    await regularSpace.groups[0].dangerouslyAddMember(adminAuth, {
      user: user.toJSON(),
    });

    const factory = new WebhookSourceViewFactory(workspace);
    const view = await factory.create(regularSpace);

    const response = await deleteView(workspace, regularSpace.sId, view.sId);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.type).toBe("workspace_auth_error");
    expect(body.error.message).toBe(ENSURE_IS_ADMIN_ERROR_MESSAGE);
  });

  it("returns 404 when webhook source view doesn't exist", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    const regularSpace = await SpaceFactory.regular(workspace);

    const fakeId = makeSId("webhook_sources_view", {
      id: 999999,
      workspaceId: workspace.id,
    });

    const response = await deleteView(workspace, regularSpace.sId, fakeId);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "webhook_source_view_not_found",
        message: "Webhook Source View not found",
      },
    });
  });

  it("returns 404 when webhook source view belongs to a different space", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    const regularSpace = await SpaceFactory.regular(workspace);
    const otherSpace = await SpaceFactory.regular(workspace);

    const factory = new WebhookSourceViewFactory(workspace);
    const view = await factory.create(otherSpace);

    const response = await deleteView(workspace, regularSpace.sId, view.sId);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "webhook_source_view_not_found",
        message: "Webhook Source View not found",
      },
    });
  });
});
