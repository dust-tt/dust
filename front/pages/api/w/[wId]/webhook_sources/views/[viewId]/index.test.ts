import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it, vi } from "vitest";

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

    expect(webhookSourceView).not.toBeNull();
    req.query.viewId = webhookSourceView.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.webhookSourceView).toBeDefined();
    expect(responseData.webhookSourceView.sId).toBe(webhookSourceView.sId);
    expect(responseData.webhookSourceView.webhookSource).toBeDefined();
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

    const globalSpace = await SpaceFactory.global(workspace);
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
});

describe("PATCH /api/w/[wId]/webhook_sources/views/[viewId]", () => {
  it("should update webhook source view name successfully", async () => {
    const { req, res, workspace } = await setupTest("admin", "PATCH");

    const globalSpace = await SpaceFactory.global(workspace);
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(globalSpace);

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
    const { req, res, workspace } = await setupTest("admin", "PATCH");

    const globalSpace = await SpaceFactory.global(workspace);
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(globalSpace);

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
    const { req, res, workspace } = await setupTest("admin", "PATCH");

    const globalSpace = await SpaceFactory.global(workspace);
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(globalSpace);

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
    const { req, res, workspace } = await setupTest("user", "PATCH");

    const globalSpace = await SpaceFactory.global(workspace);
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(globalSpace);

    expect(webhookSourceView).not.toBeNull();
    req.query.viewId = webhookSourceView.sId;

    req.body = { name: "Updated Name" };
    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
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
    const { req, res, workspace } = await setupTest("admin", "PATCH");

    const globalSpace = await SpaceFactory.global(workspace);
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(globalSpace);

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
      toJSON: vi.fn().mockReturnValue(webhookSourceView.toJSON()),
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

  it("should update webhook source view description and icon successfully", async () => {
    const { req, res, workspace } = await setupTest("admin", "PATCH");

    const globalSpace = await SpaceFactory.global(workspace);
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(globalSpace);

    expect(webhookSourceView).not.toBeNull();
    req.query.viewId = webhookSourceView.sId;
    req.body = {
      name: "Updated Webhook View Name",
      description: "This is a test description",
      icon: "ActionWebhookIcon",
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
    expect(responseData.webhookSourceView.icon).toBe("ActionWebhookIcon");
  });

  it("should update system view when updating description and icon in a non-system space", async () => {
    const { req, res, workspace, auth } = await setupTest("admin", "PATCH");

    const globalSpace = await SpaceFactory.global(workspace);
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(globalSpace);

    expect(webhookSourceView).not.toBeNull();

    // Get the system view before the update
    const systemViewBefore =
      await WebhookSourcesViewResource.getWebhookSourceViewForSystemSpace(
        auth,
        webhookSourceView.webhookSourceSId
      );
    expect(systemViewBefore).not.toBeNull();

    req.query.viewId = webhookSourceView.sId;
    req.body = {
      name: "Updated Name",
      description: "Updated description",
      icon: "ActionWebhookIcon",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    // Verify the system view was also updated
    const systemViewAfter =
      await WebhookSourcesViewResource.getWebhookSourceViewForSystemSpace(
        auth,
        webhookSourceView.webhookSourceSId
      );
    expect(systemViewAfter).not.toBeNull();
    expect(systemViewAfter!.description).toBe("Updated description");
    expect(systemViewAfter!.icon).toBe("ActionWebhookIcon");
  });

  it("should continue successfully even if system view update fails", async () => {
    const { req, res, workspace } = await setupTest("admin", "PATCH");

    const globalSpace = await SpaceFactory.global(workspace);
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(globalSpace);

    expect(webhookSourceView).not.toBeNull();
    req.query.viewId = webhookSourceView.sId;
    req.body = {
      name: "Updated Name",
      description: "Updated description",
      icon: "ActionWebhookIcon",
    };

    // Mock getWebhookSourceViewForSystemSpace to return a view with failing updateDescriptionAndIcon
    const mockSystemView = {
      updateDescriptionAndIcon: vi
        .fn()
        .mockResolvedValue(
          new Err(new DustError("internal_error", "System view update failed"))
        ),
    };

    const getSystemViewSpy = vi
      .spyOn(WebhookSourcesViewResource, "getWebhookSourceViewForSystemSpace")
      .mockResolvedValue(mockSystemView as any);

    await handler(req, res);

    // Should still succeed even though system view update failed
    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.webhookSourceView).toBeDefined();
    expect(responseData.webhookSourceView.description).toBe(
      "Updated description"
    );

    // Restore the spy
    getSystemViewSpy.mockRestore();
  });

  it("should update all space views when updating system view description and icon", async () => {
    const { req, res, workspace, auth } = await setupTest("admin", "PATCH");

    const globalSpace = await SpaceFactory.global(workspace);
    const regularSpace1 = await SpaceFactory.regular(workspace, {
      name: "Space 1",
    });
    const regularSpace2 = await SpaceFactory.regular(workspace, {
      name: "Space 2",
    });

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);

    // Create system view
    const systemView = await webhookSourceViewFactory.create(globalSpace);
    expect(systemView).not.toBeNull();

    // Add webhook to two spaces
    const spaceView1 = await webhookSourceViewFactory.createInSpace(
      regularSpace1,
      systemView.webhookSourceId
    );
    const spaceView2 = await webhookSourceViewFactory.createInSpace(
      regularSpace2,
      systemView.webhookSourceId
    );

    // Get the actual system view
    const actualSystemView =
      await WebhookSourcesViewResource.getWebhookSourceViewForSystemSpace(
        auth,
        systemView.webhookSourceSId
      );
    expect(actualSystemView).not.toBeNull();

    // Update the system view
    req.query.viewId = actualSystemView!.sId;
    req.body = {
      name: "Updated System Name",
      description: "Updated system description",
      icon: "ActionWebhookIcon",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    // Verify all space views were also updated
    const updatedSpaceView1 = await WebhookSourcesViewResource.fetchById(
      auth,
      spaceView1.sId
    );
    expect(updatedSpaceView1).not.toBeNull();
    expect(updatedSpaceView1!.description).toBe("Updated system description");
    expect(updatedSpaceView1!.icon).toBe("ActionWebhookIcon");

    const updatedSpaceView2 = await WebhookSourcesViewResource.fetchById(
      auth,
      spaceView2.sId
    );
    expect(updatedSpaceView2).not.toBeNull();
    expect(updatedSpaceView2!.description).toBe("Updated system description");
    expect(updatedSpaceView2!.icon).toBe("ActionWebhookIcon");
  });
});
