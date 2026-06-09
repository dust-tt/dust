import { DustError } from "@app/lib/error";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WebhookSourceViewFactory } from "@app/tests/utils/WebhookSourceViewFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

async function setupTest(role: MembershipRoleType = "admin") {
  const { workspace, auth, systemSpace, globalSpace } =
    await createPrivateApiMockRequest({
      role,
    });

  return { workspace, auth, systemSpace, globalSpace };
}

function getView(wId: string, viewId: string) {
  return honoApp.request(`/api/w/${wId}/webhook_sources/views/${viewId}`);
}

function patchView(wId: string, viewId: string, body: unknown) {
  return honoApp.request(`/api/w/${wId}/webhook_sources/views/${viewId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/w/[wId]/webhook_sources/views/[viewId]", () => {
  it("should return webhook source view when valid viewId is provided", async () => {
    const { workspace, globalSpace } = await setupTest("admin");

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(globalSpace);

    // Get the webhook source name from the toJSON() output since customName can be null
    const webhookSourceName = webhookSourceView.toJSONForAdmin().customName;

    expect(webhookSourceView).not.toBeNull();

    const response = await getView(workspace.sId, webhookSourceView.sId);

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.webhookSourceView).toBeDefined();
    expect(responseData.webhookSourceView.sId).toBe(webhookSourceView.sId);
    expect(responseData.webhookSourceView.webhookSource).toBeDefined();
    expect(responseData.webhookSourceView.customName).toBe(webhookSourceName);
    expect(responseData.webhookSourceView.description).toBe(
      webhookSourceView.description
    );
    expect(responseData.webhookSourceView.icon).toBe(webhookSourceView.icon);
  });

  it("should return 404 when webhook source view does not exist", async () => {
    const { workspace } = await setupTest("admin");

    const response = await getView(workspace.sId, "non_existent_view_id");

    expect(response.status).toBe(404);
    const responseData = await response.json();
    expect(responseData.error.type).toBe("webhook_source_view_not_found");
    expect(responseData.error.message).toBe("Webhook source view not found");
  });

  it("should work for user role when accessing valid webhook source view", async () => {
    const { workspace, globalSpace } = await setupTest("user");

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(globalSpace);

    expect(webhookSourceView).not.toBeNull();

    const response = await getView(workspace.sId, webhookSourceView.sId);

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.webhookSourceView).toBeDefined();
    expect(responseData.webhookSourceView.sId).toBe(webhookSourceView.sId);
  });

  it("should return nothing if user does not have access to webhook source view", async () => {
    const { workspace } = await setupTest("user");

    const space = await SpaceFactory.regular(workspace);
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView = await webhookSourceViewFactory.create(space);

    expect(webhookSourceView).not.toBeNull();

    const response = await getView(workspace.sId, webhookSourceView.sId);

    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/w/[wId]/webhook_sources/views/[viewId]", () => {
  it("should update webhook source view name successfully", async () => {
    const { workspace, systemSpace } = await setupTest("admin");

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(systemSpace);

    expect(webhookSourceView).not.toBeNull();

    const response = await patchView(workspace.sId, webhookSourceView.sId, {
      name: "Updated Webhook View Name",
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.webhookSourceView).toBeDefined();
    expect(responseData.webhookSourceView.customName).toBe(
      "Updated Webhook View Name"
    );
  });

  it("should return 400 when name is not provided in request body", async () => {
    const { workspace, systemSpace } = await setupTest("admin");

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(systemSpace);

    expect(webhookSourceView).not.toBeNull();

    const response = await patchView(workspace.sId, webhookSourceView.sId, {});

    expect(response.status).toBe(400);
    const responseData = await response.json();
    expect(responseData.error.type).toBe("invalid_request_error");
    expect(responseData.error.message).toBe(
      'Invalid request body: Validation error: Required at "name"'
    );
  });

  it("should return 400 when name is empty string", async () => {
    const { workspace, systemSpace } = await setupTest("admin");

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(systemSpace);

    expect(webhookSourceView).not.toBeNull();

    const response = await patchView(workspace.sId, webhookSourceView.sId, {
      name: "",
    });

    expect(response.status).toBe(400);
    const responseData = await response.json();
    expect(responseData.error.type).toBe("invalid_request_error");
    expect(responseData.error.message).toBe(
      'Invalid request body: Validation error: String must contain at least 1 character(s) at "name"'
    );
  });

  it("should return 404 when trying to update non-existent webhook source view", async () => {
    const { workspace } = await setupTest("admin");

    const response = await patchView(workspace.sId, "non_existent_view_id", {
      name: "Updated Name",
    });

    expect(response.status).toBe(404);
    const responseData = await response.json();
    expect(responseData.error.type).toBe("webhook_source_view_not_found");
    expect(responseData.error.message).toBe("Webhook source view not found");
  });

  it("should fail to update view when user has insufficient permissions", async () => {
    const { workspace, systemSpace } = await setupTest("user");

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(systemSpace);

    expect(webhookSourceView).not.toBeNull();

    const response = await patchView(workspace.sId, webhookSourceView.sId, {
      name: "Updated Name",
    });

    expect(response.status).toBe(403);
    const responseData = await response.json();
    expect(responseData.error.type).toBe("webhook_source_view_auth_error");
  });

  it("should handle update failure gracefully", async () => {
    const { workspace, systemSpace } = await setupTest("admin");

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(systemSpace);

    expect(webhookSourceView).not.toBeNull();

    // Mock the fetchById method to return a webhook source view with failing updateName
    const mockWebhookSourceView = {
      ...webhookSourceView,
      updateName: vi
        .fn()
        .mockResolvedValue(
          new Err(new DustError("internal_error", "Test error"))
        ),
      toJSON: vi.fn().mockReturnValue(webhookSourceView.toJSONForAdmin()),
    };

    const fetchByIdSpy = vi
      .spyOn(WebhookSourcesViewResource, "fetchById")
      .mockResolvedValue(mockWebhookSourceView as any);

    const response = await patchView(workspace.sId, webhookSourceView.sId, {
      name: "Updated Name",
    });

    expect(response.status).toBe(500);
    const responseData = await response.json();
    expect(responseData.error.type).toBe("internal_server_error");
    expect(responseData.error.message).toBe(
      "Failed to update webhook source view name."
    );

    // Restore the spy
    fetchByIdSpy.mockRestore();
  });

  it("should update name for all views of the same webhook source when admin", async () => {
    const { workspace, auth, systemSpace, globalSpace } =
      await setupTest("admin");

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const systemView = await webhookSourceViewFactory.create(systemSpace);

    expect(systemView).not.toBeNull();

    // Create additional views in global space for the same webhook source
    await webhookSourceViewFactory.create(globalSpace, {
      webhookSourceId: systemView.webhookSource.sId,
    });

    // Verify initial state
    const initialViews = await WebhookSourcesViewResource.listByWebhookSource(
      auth,
      systemView.webhookSourceId
    );
    expect(initialViews.length).toBeGreaterThanOrEqual(2);

    // Update via system view
    const response = await patchView(workspace.sId, systemView.sId, {
      name: "Updated Webhook Name",
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.webhookSourceView).toBeDefined();
    expect(responseData.webhookSourceView.customName).toBe(
      "Updated Webhook Name"
    );

    // Verify all views were updated
    const updatedViews = await WebhookSourcesViewResource.listByWebhookSource(
      auth,
      systemView.webhookSourceId
    );
    expect(updatedViews.length).toBe(initialViews.length);
    for (const view of updatedViews) {
      expect(view.customName).toBe("Updated Webhook Name");
    }
  });

  it("should update webhook source view description and icon successfully", async () => {
    const { workspace, systemSpace } = await setupTest("admin");

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(systemSpace);

    expect(webhookSourceView).not.toBeNull();

    const response = await patchView(workspace.sId, webhookSourceView.sId, {
      name: "Updated Webhook View Name",
      description: "This is a test description",
      icon: "ActionBrainIcon",
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.webhookSourceView).toBeDefined();
    expect(responseData.webhookSourceView.customName).toBe(
      "Updated Webhook View Name"
    );
    expect(responseData.webhookSourceView.description).toBe(
      "This is a test description"
    );
    expect(responseData.webhookSourceView.icon).toBe("ActionBrainIcon");
  });

  it("should update icon and description for all views of the same webhook source when admin", async () => {
    const { workspace, auth, systemSpace, globalSpace } =
      await setupTest("admin");

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const systemView = await webhookSourceViewFactory.create(systemSpace);

    expect(systemView).not.toBeNull();

    // Create additional views in global space for the same webhook source
    await webhookSourceViewFactory.create(globalSpace, {
      webhookSourceId: systemView.webhookSource.sId,
    });

    // Verify initial state
    const initialViews = await WebhookSourcesViewResource.listByWebhookSource(
      auth,
      systemView.webhookSourceId
    );
    expect(initialViews.length).toBeGreaterThanOrEqual(2);

    // Update via system view
    const response = await patchView(workspace.sId, systemView.sId, {
      name: "Updated Webhook Name",
      description: "Updated description for all views",
      icon: "ActionBrainIcon",
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.webhookSourceView).toBeDefined();
    expect(responseData.webhookSourceView.customName).toBe(
      "Updated Webhook Name"
    );
    expect(responseData.webhookSourceView.description).toBe(
      "Updated description for all views"
    );
    expect(responseData.webhookSourceView.icon).toBe("ActionBrainIcon");

    // Verify all views were updated with the new description and icon
    const updatedViews = await WebhookSourcesViewResource.listByWebhookSource(
      auth,
      systemView.webhookSourceId
    );
    expect(updatedViews.length).toBe(initialViews.length);
    for (const view of updatedViews) {
      expect(view.customName).toBe("Updated Webhook Name");
      expect(view.description).toBe("Updated description for all views");
      expect(view.icon).toBe("ActionBrainIcon");
    }
  });
});
