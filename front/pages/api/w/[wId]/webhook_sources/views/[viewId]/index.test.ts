import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it, vi } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WebhookSourceViewFactory } from "@app/tests/utils/WebhookSourceViewFactory";
import { Err } from "@app/types";

import handler from "./index";

async function setupTest(
  role: "builder" | "user" | "admin" = "admin",
  method: RequestMethod = "GET"
) {
  const { req, res, workspace, authenticator } =
    await createPrivateApiMockRequest({
      role,
      method,
    });

  const systemSpace = await SpaceFactory.system(workspace);

  // Set up common query parameters
  req.query.wId = workspace.sId;

  return { req, res, workspace, auth: authenticator, systemSpace };
}

describe("GET /api/w/[wId]/webhook_sources/views/[viewId]", () => {
  it("should return webhook source view when valid viewId is provided", async () => {
    const { req, res, workspace } = await setupTest("admin", "GET");

    const globalSpace = await SpaceFactory.global(workspace);
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(globalSpace);

    // Get the webhook source name from the toJSON() output since customName can be null
    const webhookSourceName = webhookSourceView.toJSONForAdmin().customName;

    expect(webhookSourceView).not.toBeNull();
    req.query.viewId = webhookSourceView.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
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
    const { req, res } = await setupTest("admin", "GET");

    req.query.viewId = "non_existent_view_id";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("webhook_source_view_not_found");
    expect(responseData.error.message).toBe("Webhook source view not found");
  });

  it("should return 400 when viewId parameter is invalid", async () => {
    const { req, res } = await setupTest("admin", "GET");

    req.query.viewId = ["invalid", "array"];

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("invalid_request_error");
    expect(responseData.error.message).toBe("Invalid path parameters.");
  });

  it("should work for user role when accessing valid webhook source view", async () => {
    const { req, res, workspace } = await setupTest("user", "GET");

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const { globalSpace } = await SpaceFactory.defaults(adminAuth);
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(globalSpace);

    expect(webhookSourceView).not.toBeNull();
    req.query.viewId = webhookSourceView.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.webhookSourceView).toBeDefined();
    expect(responseData.webhookSourceView.sId).toBe(webhookSourceView.sId);
  });

  it("should return nothing if user does not have access to webhook source view", async () => {
    const { req, res, workspace } = await setupTest("user", "GET");

    const space = await SpaceFactory.regular(workspace);
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView = await webhookSourceViewFactory.create(space);

    expect(webhookSourceView).not.toBeNull();
    req.query.viewId = webhookSourceView.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });
});

describe("PATCH /api/w/[wId]/webhook_sources/views/[viewId]", () => {
  it("should update webhook source view name successfully", async () => {
    const { req, res, workspace, systemSpace } = await setupTest(
      "admin",
      "PATCH"
    );

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(systemSpace);

    expect(webhookSourceView).not.toBeNull();
    req.query.viewId = webhookSourceView.sId;
    req.body = {
      name: "Updated Webhook View Name",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.webhookSourceView).toBeDefined();
    expect(responseData.webhookSourceView.customName).toBe(
      "Updated Webhook View Name"
    );
  });

  it("should return 400 when name is not provided in request body", async () => {
    const { req, res, workspace, systemSpace } = await setupTest(
      "admin",
      "PATCH"
    );

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(systemSpace);

    expect(webhookSourceView).not.toBeNull();
    req.query.viewId = webhookSourceView.sId;
    req.body = {};

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("invalid_request_error");
    expect(responseData.error.message).toBe("Invalid request body");
  });

  it("should return 400 when name is empty string", async () => {
    const { req, res, workspace, systemSpace } = await setupTest(
      "admin",
      "PATCH"
    );

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(systemSpace);

    expect(webhookSourceView).not.toBeNull();
    req.query.viewId = webhookSourceView.sId;
    req.body = {
      name: "",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("invalid_request_error");
    expect(responseData.error.message).toBe("Invalid request body");
  });

  it("should return 404 when trying to update non-existent webhook source view", async () => {
    const { req, res } = await setupTest("admin", "PATCH");

    req.query.viewId = "non_existent_view_id";
    req.body = {
      name: "Updated Name",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("webhook_source_view_not_found");
    expect(responseData.error.message).toBe("Webhook source view not found");
  });

  it("should fail to update view when user has insufficient permissions", async () => {
    const { req, res, workspace, systemSpace } = await setupTest(
      "user",
      "PATCH"
    );

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(systemSpace);

    expect(webhookSourceView).not.toBeNull();
    req.query.viewId = webhookSourceView.sId;

    req.body = { name: "Updated Name" };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("webhook_source_view_auth_error");
  });

  it("should return 400 when viewId parameter is invalid", async () => {
    const { req, res } = await setupTest("admin", "PATCH");

    req.query.viewId = ["invalid", "array"];
    req.body = {
      name: "Updated Name",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("invalid_request_error");
    expect(responseData.error.message).toBe("Invalid path parameters.");
  });

  it("should handle update failure gracefully", async () => {
    const { req, res, workspace, systemSpace } = await setupTest(
      "admin",
      "PATCH"
    );

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(systemSpace);

    expect(webhookSourceView).not.toBeNull();
    req.query.viewId = webhookSourceView.sId;
    req.body = {
      name: "Updated Name",
    };

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

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("internal_server_error");
    expect(responseData.error.message).toBe(
      "Failed to update webhook source view name."
    );

    // Restore the spy
    fetchByIdSpy.mockRestore();
  });

  it("should update name for all views of the same webhook source when admin", async () => {
    const { req, res, workspace, auth, systemSpace } = await setupTest(
      "admin",
      "PATCH"
    );

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const systemView = await webhookSourceViewFactory.create(systemSpace);

    expect(systemView).not.toBeNull();

    // Create additional views in global space for the same webhook source
    const globalSpace = await SpaceFactory.global(workspace);
    await webhookSourceViewFactory.create(globalSpace, {
      webhookSourceId: systemView.webhookSourceSId,
    });

    // Verify initial state
    const initialViews = await WebhookSourcesViewResource.listByWebhookSource(
      auth,
      systemView.webhookSourceId
    );
    expect(initialViews.length).toBeGreaterThanOrEqual(2);

    // Update via system view
    req.query.viewId = systemView.sId;
    req.body = { name: "Updated Webhook Name" };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
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
    const { req, res, workspace, systemSpace } = await setupTest(
      "admin",
      "PATCH"
    );

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(systemSpace);

    expect(webhookSourceView).not.toBeNull();
    req.query.viewId = webhookSourceView.sId;
    req.body = {
      name: "Updated Webhook View Name",
      description: "This is a test description",
      icon: "ActionBrainIcon",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
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
    const { req, res, workspace, auth, systemSpace } = await setupTest(
      "admin",
      "PATCH"
    );

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const systemView = await webhookSourceViewFactory.create(systemSpace);

    expect(systemView).not.toBeNull();

    // Create additional views in global space for the same webhook source
    const globalSpace = await SpaceFactory.global(workspace);
    await webhookSourceViewFactory.create(globalSpace, {
      webhookSourceId: systemView.webhookSourceSId,
    });

    // Verify initial state
    const initialViews = await WebhookSourcesViewResource.listByWebhookSource(
      auth,
      systemView.webhookSourceId
    );
    expect(initialViews.length).toBeGreaterThanOrEqual(2);

    // Update via system view
    req.query.viewId = systemView.sId;
    req.body = {
      name: "Updated Webhook Name",
      description: "Updated description for all views",
      icon: "ActionBrainIcon",
    };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
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
