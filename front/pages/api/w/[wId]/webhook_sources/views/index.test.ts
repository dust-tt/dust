import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
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

describe("GET /api/w/[wId]/webhook_sources/views", () => {
  it("should return all webhook source views from specified spaces", async () => {
    const { req, res, workspace, authenticator } = await setupTest(
      "admin",
      "GET"
    );

    // Create webhook sources and views
    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const result1 = await webhookSourceFactory.create({
      name: "Test Webhook Source 1",
    });
    const result2 = await webhookSourceFactory.create({
      name: "Test Webhook Source 2",
    });

    if (result1.isErr() || result2.isErr()) {
      throw new Error("Failed to create webhook sources");
    }

    const webhookSource1 = result1.value;
    const webhookSource2 = result2.value;

    // Get the existing spaces
    const spaces = await SpaceResource.listWorkspaceSpaces(authenticator);
    const globalSpace = spaces.find((s) => s.kind === "global");
    if (!globalSpace) {
      throw new Error("Global space not found");
    }

    // Create additional views for the webhook sources
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    await webhookSourceViewFactory.create(globalSpace, {
      webhookSourceId: webhookSource1.sId(),
    });
    await webhookSourceViewFactory.create(globalSpace, {
      webhookSourceId: webhookSource2.sId(),
    });

    // Query for views in the global space
    req.query.spaceIds = globalSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      success: true,
      webhookSourceViews: expect.any(Array),
    });

    // Should have at least 2 views (the ones we created in the global space)
    expect(responseData.webhookSourceViews.length).toBeGreaterThanOrEqual(2);

    // Check the structure of returned views
    const firstView = responseData.webhookSourceViews[0];
    expect(firstView).toHaveProperty("sId");
    expect(firstView).toHaveProperty("customName");
    expect(firstView).toHaveProperty("description");
    expect(firstView).toHaveProperty("icon");
    expect(firstView).toHaveProperty("kind");
    expect(firstView).toHaveProperty("subscribedEvents");
    expect(firstView).toHaveProperty("spaceId");
    expect(firstView).toHaveProperty("createdAt");
    expect(firstView).toHaveProperty("updatedAt");
    expect(firstView).toHaveProperty("editedByUser");
  });

  it("should return views from multiple spaces when multiple spaceIds provided", async () => {
    const { req, res, workspace, authenticator } = await setupTest(
      "admin",
      "GET"
    );

    // Create webhook source
    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const result = await webhookSourceFactory.create({
      name: "Test Webhook Source",
    });

    if (result.isErr()) {
      throw new Error("Failed to create webhook source");
    }

    const webhookSource = result.value;

    // Get existing spaces
    const spaces = await SpaceResource.listWorkspaceSpaces(authenticator);
    const globalSpace = spaces.find((s) => s.kind === "global");
    const systemSpace = spaces.find((s) => s.kind === "system");

    if (!globalSpace || !systemSpace) {
      throw new Error("Required spaces not found");
    }

    // Create views in both spaces
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    await webhookSourceViewFactory.create(globalSpace, {
      webhookSourceId: webhookSource.sId(),
    });

    // Query for views in both spaces (comma-separated)
    req.query.spaceIds = `${globalSpace.sId},${systemSpace.sId}`;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();

    expect(responseData.webhookSourceViews.length).toBeGreaterThanOrEqual(2);
    const spaceIds = responseData.webhookSourceViews.map((v: any) => v.spaceId);
    expect(spaceIds).toContain(globalSpace.sId);
    expect(spaceIds).toContain(systemSpace.sId);
  });

  it("should return 400 when spaceIds is missing", async () => {
    const { req, res } = await setupTest("admin", "GET");

    // Don't set spaceIds query parameter
    delete req.query.spaceIds;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);

    const responseData = res._getJSONData();
    expect(responseData.error).toEqual({
      type: "invalid_request_error",
      message: "Invalid query parameters",
    });
  });

  it("should return 400 when spaceIds is not a string", async () => {
    const { req, res } = await setupTest("admin", "GET");

    req.query.spaceIds = ["invalid", "array"];

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);

    const responseData = res._getJSONData();
    expect(responseData.error).toEqual({
      type: "invalid_request_error",
      message: "Invalid query parameters",
    });
  });

  it("should handle non-existent space IDs gracefully", async () => {
    const { req, res } = await setupTest("admin", "GET");

    // Use non-existent space IDs
    req.query.spaceIds = "non-existent-space-1,non-existent-space-2";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      success: true,
      webhookSourceViews: [],
    });
  });

  it("should work for user role when accessing spaces they have access to", async () => {
    const { req, res, workspace, authenticator } = await setupTest(
      "user",
      "GET"
    );

    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const result = await webhookSourceFactory.create({
      name: "Test Webhook Source",
    });

    if (result.isErr()) {
      throw new Error("Failed to create webhook source");
    }

    const spaces = await SpaceResource.listWorkspaceSpaces(authenticator);
    const globalSpace = spaces.find((s) => s.kind === "global");
    if (!globalSpace) {
      throw new Error("Global space not found");
    }

    req.query.spaceIds = globalSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      success: true,
      webhookSourceViews: expect.any(Array),
    });
  });

  it("should work for builder role when accessing spaces they have access to", async () => {
    const { req, res, workspace, authenticator } = await setupTest(
      "builder",
      "GET"
    );

    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const result = await webhookSourceFactory.create({
      name: "Test Webhook Source",
    });

    if (result.isErr()) {
      throw new Error("Failed to create webhook source");
    }

    const spaces = await SpaceResource.listWorkspaceSpaces(authenticator);
    const globalSpace = spaces.find((s) => s.kind === "global");
    if (!globalSpace) {
      throw new Error("Global space not found");
    }

    req.query.spaceIds = globalSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      success: true,
      webhookSourceViews: expect.any(Array),
    });
  });

  it("should only return views from spaces the user has access to", async () => {
    const { req, res, workspace, authenticator } = await setupTest(
      "admin",
      "GET"
    );

    // Create webhook source
    const webhookSourceFactory = new WebhookSourceFactory(workspace);
    const result = await webhookSourceFactory.create({
      name: "Test Webhook Source",
    });

    if (result.isErr()) {
      throw new Error("Failed to create webhook source");
    }

    const webhookSource = result.value;

    // Get spaces
    const spaces = await SpaceResource.listWorkspaceSpaces(authenticator);
    const globalSpace = spaces.find((s) => s.kind === "global");

    if (!globalSpace) {
      throw new Error("Global space not found");
    }

    // Create view in global space
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    await webhookSourceViewFactory.create(globalSpace, {
      webhookSourceId: webhookSource.sId(),
    });

    // Try to query with both valid and invalid space IDs
    req.query.spaceIds = `${globalSpace.sId},invalid-space-id`;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData.webhookSourceViews.length).toBeGreaterThanOrEqual(1);

    // All returned views should be from accessible spaces
    responseData.webhookSourceViews.forEach((view: any) => {
      expect(view.spaceId).toBe(globalSpace.sId);
    });
  });
});

describe("Method Support /api/w/[wId]/webhook_sources/views", () => {
  it("should return 405 for POST method", async () => {
    const { req, res, authenticator } = await setupTest("admin", "POST");

    const spaces = await SpaceResource.listWorkspaceSpaces(authenticator);
    const globalSpace = spaces.find((s) => s.kind === "global");
    if (!globalSpace) {
      throw new Error("Global space not found");
    }

    req.query.spaceIds = globalSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);

    const responseData = res._getJSONData();
    expect(responseData.error).toEqual({
      type: "method_not_supported_error",
      message: "The method passed is not supported, GET is expected.",
    });
  });

  it("should return 405 for PUT method", async () => {
    const { req, res, authenticator } = await setupTest("admin", "PUT");

    const spaces = await SpaceResource.listWorkspaceSpaces(authenticator);
    const globalSpace = spaces.find((s) => s.kind === "global");
    if (!globalSpace) {
      throw new Error("Global space not found");
    }

    req.query.spaceIds = globalSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);

    const responseData = res._getJSONData();
    expect(responseData.error).toEqual({
      type: "method_not_supported_error",
      message: "The method passed is not supported, GET is expected.",
    });
  });

  it("should return 405 for DELETE method", async () => {
    const { req, res, authenticator } = await setupTest("admin", "DELETE");

    const spaces = await SpaceResource.listWorkspaceSpaces(authenticator);
    const globalSpace = spaces.find((s) => s.kind === "global");
    if (!globalSpace) {
      throw new Error("Global space not found");
    }

    req.query.spaceIds = globalSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);

    const responseData = res._getJSONData();
    expect(responseData.error).toEqual({
      type: "method_not_supported_error",
      message: "The method passed is not supported, GET is expected.",
    });
  });
});
