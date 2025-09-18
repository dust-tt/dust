import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it, vi } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WebhookSourceFactory } from "@app/tests/utils/WebhookSourceFactory";
import { WebhookSourceViewFactory } from "@app/tests/utils/WebhookSourceViewFactory";

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

  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  await SpaceFactory.defaults(adminAuth);

  // Set up common query parameters
  req.query.wId = workspace.sId;

  return { req, res, workspace, authenticator };
}

describe("GET /api/w/[wId]/webhook_sources/[webhookSourceId]/views", () => {
  it("should return all views for an existing webhook source", async () => {
    const { req, res, workspace, authenticator } = await setupTest(
      "admin",
      "GET"
    );

    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const result = await webhookSourceFactory.create({
      name: "Test Webhook Source",
    });

    if (result.isErr()) {
      throw new Error(
        `Failed to create webhook source: ${result.error.message}`
      );
    }

    const webhookSource = result.value;
    req.query.webhookSourceId = webhookSource.sId();

    // Create additional views for the webhook source
    // Get the existing global space instead of creating a new one
    const spaces = await SpaceResource.listWorkspaceSpaces(authenticator);
    const globalSpace = spaces.find((s) => s.kind === "global");
    if (!globalSpace) {
      throw new Error("Global space not found");
    }
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    await webhookSourceViewFactory.create(globalSpace, {
      webhookSourceId: webhookSource.id,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      success: true,
      views: expect.any(Array),
    });

    expect(responseData.views).toHaveLength(2); // system view + global view
    expect(responseData.views[0]).toHaveProperty("sId");
    expect(responseData.views[0]).toHaveProperty("webhookSource");
  });

  it("should return only system view when no additional views exist", async () => {
    const { req, res, workspace } = await setupTest("admin", "GET");

    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const result = await webhookSourceFactory.create({
      name: "Test Webhook Source",
    });

    if (result.isErr()) {
      throw new Error(
        `Failed to create webhook source: ${result.error.message}`
      );
    }

    const webhookSource = result.value;
    req.query.webhookSourceId = webhookSource.sId();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      success: true,
      views: expect.any(Array),
    });

    expect(responseData.views).toHaveLength(1); // only system view
    expect(responseData.views[0]).toHaveProperty("sId");
    expect(responseData.views[0]).toHaveProperty("webhookSource");
  });

  it("should return 404 when webhook source does not exist", async () => {
    const { req, res, workspace } = await setupTest("admin", "GET");
    req.query.webhookSourceId = makeSId("webhook_source", {
      id: 999999,
      workspaceId: workspace.id,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);

    const responseData = res._getJSONData();
    expect(responseData.error).toEqual({
      type: "webhook_source_not_found",
      message: "The webhook source was not found.",
    });
  });

  it("should return 400 when webhookSourceId is invalid", async () => {
    const { req, res } = await setupTest("admin", "GET");
    req.query.webhookSourceId = ["invalid", "array"];

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);

    const responseData = res._getJSONData();
    expect(responseData.error).toEqual({
      type: "invalid_request_error",
      message: "Invalid webhook source ID.",
    });
  });

  it("should return 500 when fetching views fails", async () => {
    const { req, res, workspace } = await setupTest("admin", "GET");

    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const result = await webhookSourceFactory.create({
      name: "Test Webhook Source",
    });

    if (result.isErr()) {
      throw new Error(
        `Failed to create webhook source: ${result.error.message}`
      );
    }

    const webhookSource = result.value;
    req.query.webhookSourceId = webhookSource.sId();

    // Mock the listByWebhookSource method to simulate failure
    const listSpy = vi
      .spyOn(WebhookSourcesViewResource, "listByWebhookSource")
      .mockImplementation(async () => {
        throw new Error("Database error");
      });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);

    const responseData = res._getJSONData();
    expect(responseData.error).toEqual({
      type: "internal_server_error",
      message: "Failed to fetch webhook source views.",
    });

    // Restore the original method
    listSpy.mockRestore();
  });

  it("should work for user role when accessing valid webhook source", async () => {
    const { req, res, workspace } = await setupTest("user", "GET");

    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const result = await webhookSourceFactory.create({
      name: "Test Webhook Source",
    });

    if (result.isErr()) {
      throw new Error(
        `Failed to create webhook source: ${result.error.message}`
      );
    }

    const webhookSource = result.value;
    req.query.webhookSourceId = webhookSource.sId();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      success: true,
      views: expect.any(Array),
    });
  });

  it("should work for builder role when accessing valid webhook source", async () => {
    const { req, res, workspace } = await setupTest("builder", "GET");

    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const result = await webhookSourceFactory.create({
      name: "Test Webhook Source",
    });

    if (result.isErr()) {
      throw new Error(
        `Failed to create webhook source: ${result.error.message}`
      );
    }

    const webhookSource = result.value;
    req.query.webhookSourceId = webhookSource.sId();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      success: true,
      views: expect.any(Array),
    });
  });

  it("should return 401 when user does not have access to the workspace", async () => {
    const { req, res } = await setupTest("admin", "GET");

    // Create a separate workspace that the authenticated user doesn't have access to
    const { workspace: otherWorkspace, authenticator: otherAuth } =
      await createPrivateApiMockRequest({
        role: "admin",
      });

    // Set up spaces for the other workspace
    await SpaceFactory.defaults(otherAuth);

    // Create a webhook source in the other workspace
    const webhookSourceFactory = new WebhookSourceFactory(otherWorkspace);
    const result = await webhookSourceFactory.create({
      name: "Test Webhook Source in Other Workspace",
    });

    if (result.isErr()) {
      throw new Error(
        `Failed to create webhook source: ${result.error.message}`
      );
    }

    const webhookSource = result.value;
    req.query.webhookSourceId = webhookSource.sId();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);

    const responseData = res._getJSONData();
    expect(responseData.error).toEqual({
      type: "workspace_auth_error",
      message: "Only users of the workspace can access this route.",
    });
  });
});

describe("Method Support /api/w/[wId]/webhook_sources/[webhookSourceId]/views", () => {
  it("should return 405 for POST method", async () => {
    const { req, res, workspace } = await setupTest("admin", "POST");

    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const result = await webhookSourceFactory.create({
      name: "Test Webhook Source",
    });

    if (result.isErr()) {
      throw new Error(
        `Failed to create webhook source: ${result.error.message}`
      );
    }

    const webhookSource = result.value;
    req.query.webhookSourceId = webhookSource.sId();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);

    const responseData = res._getJSONData();
    expect(responseData.error).toEqual({
      type: "method_not_supported_error",
      message: "The method passed is not supported, GET is expected.",
    });
  });
});
