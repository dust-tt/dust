import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it, vi } from "vitest";

import { makeSId } from "@app/lib/resources/string_ids";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WebhookSourceFactory } from "@app/tests/utils/WebhookSourceFactory";

import handler from "./index";

async function setupTest(
  role: "builder" | "user" | "admin" = "admin",
  method: RequestMethod = "DELETE"
) {
  const { req, res, workspace, authenticator } =
    await createPrivateApiMockRequest({
      role,
      method,
    });

  // Create a system space to hold the Webhook sources
  await SpaceFactory.defaults(authenticator);

  // Set up common query parameters
  req.query.wId = workspace.sId;

  return { req, res, workspace, authenticator };
}

describe("DELETE /api/w/[wId]/webhook_sources/[webhookSourceId]", () => {
  it("should successfully delete an existing webhook source", async () => {
    const { req, res, workspace, authenticator } = await setupTest(
      "admin",
      "DELETE"
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

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      success: true,
    });

    // Verify the webhook source was actually deleted
    const deletedWebhookSource = await WebhookSourceResource.fetchById(
      authenticator,
      webhookSource.sId()
    );
    expect(deletedWebhookSource).toBeNull();
  });

  it("should return 404 when webhook source does not exist", async () => {
    const { req, res, workspace } = await setupTest("admin", "DELETE");
    req.query.webhookSourceId = makeSId("webhook_source", {
      id: 999999,
      workspaceId: workspace.id,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);

    const responseData = res._getJSONData();
    expect(responseData.error).toEqual({
      type: "webhook_source_not_found",
      message: "The webhook source you're trying to delete was not found.",
    });
  });

  it("should return 400 when webhookSourceId is invalid", async () => {
    const { req, res } = await setupTest("admin", "DELETE");
    req.query.webhookSourceId = ["invalid", "array"];

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);

    const responseData = res._getJSONData();
    expect(responseData.error).toEqual({
      type: "invalid_request_error",
      message: "Invalid webhook source ID.",
    });
  });

  it("should return 500 when webhook source deletion fails", async () => {
    const { req, res, workspace } = await setupTest("admin", "DELETE");

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

    // Mock the delete method to simulate failure
    const deleteSpy = vi
      .spyOn(WebhookSourceResource.prototype, "delete")
      .mockImplementation(async () => {
        throw new Error("Database error");
      });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);

    const responseData = res._getJSONData();
    expect(responseData.error).toEqual({
      type: "internal_server_error",
      message: "Failed to delete webhook source.",
    });

    // Restore the original method
    deleteSpy.mockRestore();
  });
});

describe("Method Support /api/w/[wId]/webhook_sources/[webhookSourceId]", () => {
  it("should return 405 for GET method", async () => {
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

    expect(res._getStatusCode()).toBe(405);

    const responseData = res._getJSONData();
    expect(responseData.error).toEqual({
      type: "method_not_supported_error",
      message: "The method passed is not supported, DELETE is expected.",
    });
  });

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
      message: "The method passed is not supported, DELETE is expected.",
    });
  });
});
