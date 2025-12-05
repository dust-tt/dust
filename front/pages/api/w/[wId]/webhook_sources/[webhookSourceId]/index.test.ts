import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it, vi } from "vitest";

import { makeSId } from "@app/lib/resources/string_ids";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WebhookSourceFactory } from "@app/tests/utils/WebhookSourceFactory";
import type { WorkspaceType } from "@app/types";

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

async function createWebhookSource(workspace: WorkspaceType, name: string) {
  const webhookSourceFactory = new WebhookSourceFactory(workspace);
  return webhookSourceFactory.create({ name });
}

describe("DELETE /api/w/[wId]/webhook_sources/[webhookSourceId]", () => {
  it("should successfully delete an existing webhook source", async () => {
    const { req, res, workspace, authenticator } = await setupTest(
      "admin",
      "DELETE"
    );

    const webhookSource = await createWebhookSource(
      workspace,
      "Test Webhook Source"
    );
    req.query.webhookSourceId = webhookSource.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      success: true,
    });

    // Verify the webhook source was actually deleted
    const deletedWebhookSource = await WebhookSourceResource.fetchById(
      authenticator,
      webhookSource.sId
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

    const webhookSource = await createWebhookSource(
      workspace,
      "Test Webhook Source"
    );
    req.query.webhookSourceId = webhookSource.sId;

    // Mock the delete method to simulate failure
    const deleteSpy = vi
      .spyOn(WebhookSourceResource.prototype, "delete")
      .mockImplementation(async () => {
        throw new Error("Database error");
      });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);

    const responseData = res._getJSONData();
    expect(responseData.error.type).toEqual("internal_server_error");

    // Restore the original method
    deleteSpy.mockRestore();
  });

  it("should successfully delete a webhook source with associated webhook requests", async () => {
    const { req, res, workspace, authenticator } = await setupTest(
      "admin",
      "DELETE"
    );

    const webhookSource = await createWebhookSource(
      workspace,
      "Test Webhook Source"
    );
    req.query.webhookSourceId = webhookSource.sId;

    // Create associated webhook requests
    await WebhookRequestResource.makeNew({
      workspaceId: workspace.id,
      webhookSourceId: webhookSource.id,
      status: "received",
      processedAt: null,
      errorMessage: null,
    });

    await WebhookRequestResource.makeNew({
      workspaceId: workspace.id,
      webhookSourceId: webhookSource.id,
      status: "processed",
      processedAt: new Date(),
      errorMessage: null,
    });

    // Verify the webhook requests were created
    const webhookRequests = await WebhookRequestResource.fetchByWebhookSourceId(
      authenticator,
      webhookSource.id
    );
    expect(webhookRequests.length).toBe(2);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      success: true,
    });

    // Verify the webhook source was deleted
    const deletedWebhookSource = await WebhookSourceResource.fetchById(
      authenticator,
      webhookSource.sId
    );
    expect(deletedWebhookSource).toBeNull();

    // Verify the webhook requests were also deleted
    const remainingWebhookRequests =
      await WebhookRequestResource.fetchByWebhookSourceId(
        authenticator,
        webhookSource.id
      );
    expect(remainingWebhookRequests.length).toBe(0);
  });
});

describe("PATCH /api/w/[wId]/webhook_sources/[webhookSourceId]", () => {
  it("should successfully update remoteMetadata", async () => {
    const { req, res, workspace, authenticator } = await setupTest(
      "admin",
      "PATCH"
    );

    const webhookSource = await createWebhookSource(
      workspace,
      "Test Webhook Source"
    );
    req.query.webhookSourceId = webhookSource.sId;
    req.body = {
      remoteMetadata: { id: "remote-webhook-123", repo: "owner/repo" },
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      success: true,
    });

    // Verify the webhook source was actually updated
    const updatedWebhookSource = await WebhookSourceResource.fetchById(
      authenticator,
      webhookSource.sId
    );
    expect(updatedWebhookSource?.remoteMetadata).toEqual({
      id: "remote-webhook-123",
      repo: "owner/repo",
    });
  });

  it("should successfully update oauthConnectionId", async () => {
    const { req, res, workspace, authenticator } = await setupTest(
      "admin",
      "PATCH"
    );

    const webhookSource = await createWebhookSource(
      workspace,
      "Test Webhook Source"
    );
    req.query.webhookSourceId = webhookSource.sId;
    req.body = {
      oauthConnectionId: "connection-456",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      success: true,
    });

    // Verify the webhook source was actually updated
    const updatedWebhookSource = await WebhookSourceResource.fetchById(
      authenticator,
      webhookSource.sId
    );
    expect(updatedWebhookSource?.oauthConnectionId).toBe("connection-456");
  });

  it("should successfully update multiple fields at once", async () => {
    const { req, res, workspace, authenticator } = await setupTest(
      "admin",
      "PATCH"
    );

    const webhookSource = await createWebhookSource(
      workspace,
      "Test Webhook Source"
    );
    req.query.webhookSourceId = webhookSource.sId;
    req.body = {
      remoteMetadata: { id: "remote-webhook-789", repo: "org/project" },
      oauthConnectionId: "connection-789",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      success: true,
    });

    // Verify all fields were updated
    const updatedWebhookSource = await WebhookSourceResource.fetchById(
      authenticator,
      webhookSource.sId
    );
    expect(updatedWebhookSource?.remoteMetadata).toEqual({
      id: "remote-webhook-789",
      repo: "org/project",
    });
    expect(updatedWebhookSource?.oauthConnectionId).toBe("connection-789");
  });

  it("should ignore invalid field types and only update valid fields", async () => {
    const { req, res, workspace, authenticator } = await setupTest(
      "admin",
      "PATCH"
    );

    const webhookSource = await createWebhookSource(
      workspace,
      "Test Webhook Source"
    );
    req.query.webhookSourceId = webhookSource.sId;
    req.body = {
      remoteMetadata: "invalid", // Invalid: should be object
      oauthConnectionId: "valid-connection",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseData = res._getJSONData();
    expect(responseData).toEqual({
      success: true,
    });

    // Verify only the valid field was updated
    const updatedWebhookSource = await WebhookSourceResource.fetchById(
      authenticator,
      webhookSource.sId
    );
    expect(updatedWebhookSource?.remoteMetadata).toBeNull();
    expect(updatedWebhookSource?.oauthConnectionId).toBe("valid-connection");
  });

  it("should return 500 on empty body (no updates)", async () => {
    const { req, res, workspace } = await setupTest("admin", "PATCH");

    const webhookSource = await createWebhookSource(
      workspace,
      "Test Webhook Source"
    );
    req.query.webhookSourceId = webhookSource.sId;
    req.body = {};

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
  });

  it("should return 404 when webhook source does not exist", async () => {
    const { req, res, workspace } = await setupTest("admin", "PATCH");
    req.query.webhookSourceId = makeSId("webhook_source", {
      id: 999999,
      workspaceId: workspace.id,
    });
    req.body = {
      remoteMetadata: { id: "remote-webhook-123" },
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);

    const responseData = res._getJSONData();
    expect(responseData.error).toEqual({
      type: "webhook_source_not_found",
      message: "The webhook source you're trying to update was not found.",
    });
  });

  it("should return 400 when webhookSourceId is invalid", async () => {
    const { req, res } = await setupTest("admin", "PATCH");
    req.query.webhookSourceId = ["invalid", "array"];
    req.body = {
      remoteMetadata: { id: "remote-webhook-123" },
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);

    const responseData = res._getJSONData();
    expect(responseData.error).toEqual({
      type: "invalid_request_error",
      message: "Invalid webhook source ID.",
    });
  });
});

describe("Method Support /api/w/[wId]/webhook_sources/[webhookSourceId]", () => {
  it("should return 405 for GET method", async () => {
    const { req, res, workspace } = await setupTest("admin", "GET");

    const webhookSource = await createWebhookSource(
      workspace,
      "Test Webhook Source"
    );
    req.query.webhookSourceId = webhookSource.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);

    const responseData = res._getJSONData();
    expect(responseData.error).toEqual({
      type: "method_not_supported_error",
      message:
        "The method passed is not supported, PATCH or DELETE is expected.",
    });
  });

  it("should return 405 for POST method", async () => {
    const { req, res, workspace } = await setupTest("admin", "POST");

    const webhookSource = await createWebhookSource(
      workspace,
      "Test Webhook Source"
    );
    req.query.webhookSourceId = webhookSource.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);

    const responseData = res._getJSONData();
    expect(responseData.error).toEqual({
      type: "method_not_supported_error",
      message:
        "The method passed is not supported, PATCH or DELETE is expected.",
    });
  });
});
