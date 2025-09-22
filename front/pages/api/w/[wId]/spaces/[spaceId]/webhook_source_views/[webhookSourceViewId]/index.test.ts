import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { makeSId } from "@app/lib/resources/string_ids";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WebhookSourceViewFactory } from "@app/tests/utils/WebhookSourceViewFactory";

import handler from "./index";

async function setupTest(
  role: "builder" | "user" | "admin" = "admin",
  method: RequestMethod = "DELETE"
) {
  const { req, res, workspace, user, authenticator } =
    await createPrivateApiMockRequest({
      role,
      method,
    });

  // Create system space first (required for webhook source creation)
  await SpaceFactory.system(workspace);
  const space = await SpaceFactory.regular(workspace);

  // Set up common query parameters
  req.query.wId = workspace.sId;
  req.query.spaceId = space.sId;

  return { req, res, workspace, space, user, authenticator };
}

describe("DELETE /api/w/[wId]/spaces/[spaceId]/webhook_source_views/[webhookSourceViewId]", () => {
  it("should successfully delete a webhook source view", async () => {
    const { req, res, workspace, space, authenticator } = await setupTest(
      "admin",
      "DELETE"
    );

    // Create a webhook source view
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView = await webhookSourceViewFactory.create(space);

    req.query.webhookSourceViewId = webhookSourceView.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("deleted", true);

    // Verify the webhook source view was actually deleted
    const deletedWebhookSourceView = await WebhookSourcesViewResource.fetchById(
      authenticator,
      webhookSourceView.sId
    );

    expect(deletedWebhookSourceView).toBe(null);
  });

  it("should successfully delete a webhook source view from global space", async () => {
    const { req, res, workspace, authenticator } = await setupTest(
      "admin",
      "DELETE"
    );

    // Create global space
    const globalSpace = await SpaceFactory.global(workspace);

    // Create a webhook source view in global space
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(globalSpace);

    req.query.spaceId = globalSpace.sId;
    req.query.webhookSourceViewId = webhookSourceView.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("deleted", true);

    // Verify the webhook source view was actually deleted
    const deletedWebhookSourceView = await WebhookSourcesViewResource.fetchById(
      authenticator,
      webhookSourceView.sId
    );

    expect(deletedWebhookSourceView).toBe(null);
  });

  it("should return 404 when user is not admin", async () => {
    const { req, res, workspace, user, authenticator } = await setupTest(
      "builder",
      "DELETE"
    );

    const regularSpace = await SpaceFactory.regular(workspace);
    await regularSpace.groups[0].addMember(authenticator, user.toJSON());

    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView =
      await webhookSourceViewFactory.create(regularSpace);

    req.query.webhookSourceViewId = webhookSourceView.sId;
    req.query.spaceId = regularSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    const responseData = res._getJSONData();
    expect(responseData).toHaveProperty("error");
    expect(responseData.error).toHaveProperty("type", "space_not_found");
  });

  it("should return 404 when webhook source view doesn't exist", async () => {
    const { req, res, workspace } = await setupTest("admin", "DELETE");

    req.query.webhookSourceViewId = makeSId("webhook_sources_view", {
      id: 999999,
      workspaceId: workspace.id,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "webhook_source_view_not_found",
        message: "Webhook Source View not found",
      },
    });
  });

  it("should return 404 when webhook source view belongs to different space", async () => {
    const { req, res, workspace } = await setupTest("admin", "DELETE");

    // Create webhook source view in a different space
    const otherSpace = await SpaceFactory.regular(workspace);
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView = await webhookSourceViewFactory.create(otherSpace);

    req.query.webhookSourceViewId = webhookSourceView.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "webhook_source_view_not_found",
        message: "Webhook Source View not found",
      },
    });
  });

  // TODO: Add test for unsupported space types once webhook source view creation
  // in conversations spaces is properly supported in the test environment

  it("should return 400 for invalid webhook source view ID", async () => {
    const { req, res } = await setupTest("admin", "DELETE");

    req.query.webhookSourceViewId = ["invalid", "array"]; // Invalid type

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  });
});

describe("Method Support /api/w/[wId]/spaces/[spaceId]/webhook_source_views/[webhookSourceViewId]", () => {
  it("only supports DELETE method", async () => {
    const { req, res, workspace, space } = await setupTest("admin", "GET");

    // Create a webhook source view
    const webhookSourceViewFactory = new WebhookSourceViewFactory(workspace);
    const webhookSourceView = await webhookSourceViewFactory.create(space);

    req.query.webhookSourceViewId = webhookSourceView.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, only DELETE is expected.",
      },
    });
  });
});
