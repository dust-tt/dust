import { makeSId } from "@app/lib/resources/string_ids";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WebhookSourceFactory } from "@app/tests/utils/WebhookSourceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

async function setupTest(role: MembershipRoleType = "admin") {
  const { workspace, auth } = await createPrivateApiMockRequest({ role });
  return { workspace, auth };
}

async function createWebhookSource(workspace: WorkspaceType, name: string) {
  const webhookSourceFactory = new WebhookSourceFactory(workspace);
  return webhookSourceFactory.create({ name });
}

function deleteSource(wId: string, webhookSourceId: string) {
  return honoApp.request(`/api/w/${wId}/webhook_sources/${webhookSourceId}`, {
    method: "DELETE",
  });
}

function patchSource(wId: string, webhookSourceId: string, body: unknown) {
  return honoApp.request(`/api/w/${wId}/webhook_sources/${webhookSourceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("DELETE /api/w/[wId]/webhook_sources/[webhookSourceId]", () => {
  it("should successfully delete an existing webhook source", async () => {
    const { workspace, auth } = await setupTest();
    const webhookSource = await createWebhookSource(
      workspace,
      "Test Webhook Source"
    );

    const response = await deleteSource(workspace.sId, webhookSource.sId);

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData).toEqual({ success: true });

    const deletedWebhookSource = await WebhookSourceResource.fetchById(
      auth,
      webhookSource.sId
    );
    expect(deletedWebhookSource).toBeNull();
  });

  it("should return 404 when webhook source does not exist", async () => {
    const { workspace } = await setupTest();
    const fakeSId = makeSId("webhook_source", {
      id: 999999,
      workspaceId: workspace.id,
    });

    const response = await deleteSource(workspace.sId, fakeSId);

    expect(response.status).toBe(404);
    const responseData = await response.json();
    expect(responseData.error).toEqual({
      type: "webhook_source_not_found",
      message: "The webhook source you're trying to delete was not found.",
    });
  });

  it("should return 500 when webhook source deletion fails", async () => {
    const { workspace } = await setupTest();
    const webhookSource = await createWebhookSource(
      workspace,
      "Test Webhook Source"
    );

    const deleteSpy = vi
      .spyOn(WebhookSourceResource.prototype, "hardDelete")
      .mockImplementation(async () => {
        throw new Error("Database error");
      });

    const response = await deleteSource(workspace.sId, webhookSource.sId);

    expect(response.status).toBe(500);
    const responseData = await response.json();
    expect(responseData.error.type).toEqual("internal_server_error");

    deleteSpy.mockRestore();
  });

  it("should successfully delete a webhook source with associated webhook requests", async () => {
    const { workspace, auth } = await setupTest();
    const webhookSource = await createWebhookSource(
      workspace,
      "Test Webhook Source"
    );

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

    const webhookRequests = await WebhookRequestResource.fetchByWebhookSourceId(
      auth,
      webhookSource.id
    );
    expect(webhookRequests.length).toBe(2);

    const response = await deleteSource(workspace.sId, webhookSource.sId);

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData).toEqual({ success: true });

    const deletedWebhookSource = await WebhookSourceResource.fetchById(
      auth,
      webhookSource.sId
    );
    expect(deletedWebhookSource).toBeNull();

    const remainingWebhookRequests =
      await WebhookRequestResource.fetchByWebhookSourceId(
        auth,
        webhookSource.id
      );
    expect(remainingWebhookRequests.length).toBe(0);
  });

  it("should return 403 when caller is not an admin", async () => {
    const { workspace } = await setupTest("user");
    const webhookSource = await createWebhookSource(
      workspace,
      "Test Webhook Source"
    );

    const response = await deleteSource(workspace.sId, webhookSource.sId);

    expect(response.status).toBe(403);
    const responseData = await response.json();
    expect(responseData.error.type).toBe("workspace_auth_error");
  });
});

describe("PATCH /api/w/[wId]/webhook_sources/[webhookSourceId]", () => {
  it("should successfully update remoteMetadata", async () => {
    const { workspace, auth } = await setupTest();
    const webhookSource = await createWebhookSource(
      workspace,
      "Test Webhook Source"
    );

    const response = await patchSource(workspace.sId, webhookSource.sId, {
      remoteMetadata: { id: "remote-webhook-123", repo: "owner/repo" },
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData).toEqual({ success: true });

    const updatedWebhookSource = await WebhookSourceResource.fetchById(
      auth,
      webhookSource.sId
    );
    expect(updatedWebhookSource?.remoteMetadata).toEqual({
      id: "remote-webhook-123",
      repo: "owner/repo",
    });
  });

  it("should successfully update oauthConnectionId", async () => {
    const { workspace, auth } = await setupTest();
    const webhookSource = await createWebhookSource(
      workspace,
      "Test Webhook Source"
    );

    const response = await patchSource(workspace.sId, webhookSource.sId, {
      oauthConnectionId: "connection-456",
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData).toEqual({ success: true });

    const updatedWebhookSource = await WebhookSourceResource.fetchById(
      auth,
      webhookSource.sId
    );
    expect(updatedWebhookSource?.oauthConnectionId).toBe("connection-456");
  });

  it("should successfully update multiple fields at once", async () => {
    const { workspace, auth } = await setupTest();
    const webhookSource = await createWebhookSource(
      workspace,
      "Test Webhook Source"
    );

    const response = await patchSource(workspace.sId, webhookSource.sId, {
      remoteMetadata: { id: "remote-webhook-789", repo: "org/project" },
      oauthConnectionId: "connection-789",
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData).toEqual({ success: true });

    const updatedWebhookSource = await WebhookSourceResource.fetchById(
      auth,
      webhookSource.sId
    );
    expect(updatedWebhookSource?.remoteMetadata).toEqual({
      id: "remote-webhook-789",
      repo: "org/project",
    });
    expect(updatedWebhookSource?.oauthConnectionId).toBe("connection-789");
  });

  it("should ignore invalid field types and only update valid fields", async () => {
    const { workspace, auth } = await setupTest();
    const webhookSource = await createWebhookSource(
      workspace,
      "Test Webhook Source"
    );

    const response = await patchSource(workspace.sId, webhookSource.sId, {
      remoteMetadata: "invalid",
      oauthConnectionId: "valid-connection",
    });

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData).toEqual({ success: true });

    const updatedWebhookSource = await WebhookSourceResource.fetchById(
      auth,
      webhookSource.sId
    );
    expect(updatedWebhookSource?.remoteMetadata).toBeNull();
    expect(updatedWebhookSource?.oauthConnectionId).toBe("valid-connection");
  });

  it("should return 404 when webhook source does not exist", async () => {
    const { workspace } = await setupTest();
    const fakeSId = makeSId("webhook_source", {
      id: 999999,
      workspaceId: workspace.id,
    });

    const response = await patchSource(workspace.sId, fakeSId, {
      remoteMetadata: { id: "remote-webhook-123" },
    });

    expect(response.status).toBe(404);
    const responseData = await response.json();
    expect(responseData.error).toEqual({
      type: "webhook_source_not_found",
      message: "The webhook source you're trying to update was not found.",
    });
  });

  it("should return 403 when caller is not an admin", async () => {
    const { workspace } = await setupTest("user");
    const webhookSource = await createWebhookSource(
      workspace,
      "Test Webhook Source"
    );

    const response = await patchSource(workspace.sId, webhookSource.sId, {
      remoteMetadata: { id: "remote-webhook-123" },
    });

    expect(response.status).toBe(403);
    const responseData = await response.json();
    expect(responseData.error.type).toBe("workspace_auth_error");
  });
});
