import { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { TriggerStatus } from "@app/types/assistant/triggers";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function patchStatus(workspace: { sId: string }, tId: string, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/triggers/${tId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// A second workspace member whose triggers the session user does not edit.
async function createOtherEditorAuth(workspace: WorkspaceType) {
  const otherUser = await UserFactory.basic();
  await MembershipFactory.associate(workspace, otherUser, { role: "user" });
  return Authenticator.fromUserIdAndWorkspaceId(otherUser.sId, workspace.sId);
}

describe("PATCH /api/w/:wId/triggers/:tId/status", () => {
  it("lets the editor enable their own disabled trigger", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "user",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await TriggerFactory.webhook(auth, {
      agentConfigurationId: agent.sId,
    });

    const response = await patchStatus(workspace, trigger.sId, {
      status: "enabled",
    });

    expect(response.status).toBe(204);
    const updated = await TriggerResource.fetchById(auth, trigger.sId);
    expect(updated?.status).toBe("enabled");
  });

  it("lets an admin disable another member's enabled trigger, locking it", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const editorAuth = await createOtherEditorAuth(workspace);
    const agent = await AgentConfigurationFactory.createTestAgent(editorAuth);
    const trigger = await TriggerFactory.webhook(editorAuth, {
      agentConfigurationId: agent.sId,
      status: "enabled",
    });

    const response = await patchStatus(workspace, trigger.sId, {
      status: "disabled",
    });

    expect(response.status).toBe(204);
    const updated = await TriggerResource.fetchById(editorAuth, trigger.sId);
    expect(updated?.status).toBe("disabled_by_manager");
  });

  it("stores a plain disabled status when the editor pauses their own trigger", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "user",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await TriggerFactory.webhook(auth, {
      agentConfigurationId: agent.sId,
      status: "enabled",
    });

    const response = await patchStatus(workspace, trigger.sId, {
      status: "disabled",
    });

    expect(response.status).toBe(204);
    const updated = await TriggerResource.fetchById(auth, trigger.sId);
    expect(updated?.status).toBe("disabled");
  });

  it.each<{ target: "enabled" | "disabled" }>([
    { target: "enabled" },
    { target: "disabled" },
  ])("rejects a non-admin editor setting an admin-locked trigger to $target", async ({
    target,
  }) => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "user",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await TriggerFactory.webhook(auth, {
      agentConfigurationId: agent.sId,
      status: "disabled_by_manager",
    });

    const response = await patchStatus(workspace, trigger.sId, {
      status: target,
    });

    expect(response.status).toBe(403);
    const updated = await TriggerResource.fetchById(auth, trigger.sId);
    expect(updated?.status).toBe("disabled_by_manager");
  });

  it("lets an admin re-enable an admin-locked trigger", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const editorAuth = await createOtherEditorAuth(workspace);
    const agent = await AgentConfigurationFactory.createTestAgent(editorAuth);
    const trigger = await TriggerFactory.webhook(editorAuth, {
      agentConfigurationId: agent.sId,
      status: "disabled_by_manager",
    });

    const response = await patchStatus(workspace, trigger.sId, {
      status: "enabled",
    });

    expect(response.status).toBe(204);
    const updated = await TriggerResource.fetchById(editorAuth, trigger.sId);
    expect(updated?.status).toBe("enabled");
  });

  it("lets a manager disable and re-enable a trigger they own", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "manager",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await TriggerFactory.webhook(auth, {
      agentConfigurationId: agent.sId,
      status: "enabled",
    });

    const disableResponse = await patchStatus(workspace, trigger.sId, {
      status: "disabled",
    });
    expect(disableResponse.status).toBe(204);
    let updated = await TriggerResource.fetchById(auth, trigger.sId);
    // Managers have the same standing as admins here, so even a manager's
    // own trigger locks the same way an admin's action would.
    expect(updated?.status).toBe("disabled_by_manager");

    const enableResponse = await patchStatus(workspace, trigger.sId, {
      status: "enabled",
    });
    expect(enableResponse.status).toBe(204);
    updated = await TriggerResource.fetchById(auth, trigger.sId);
    expect(updated?.status).toBe("enabled");
  });

  it("lets a manager disable and lock another member's trigger", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "manager",
    });
    const editorAuth = await createOtherEditorAuth(workspace);
    const agent = await AgentConfigurationFactory.createTestAgent(editorAuth);
    const trigger = await TriggerFactory.webhook(editorAuth, {
      agentConfigurationId: agent.sId,
      status: "enabled",
    });

    const response = await patchStatus(workspace, trigger.sId, {
      status: "disabled",
    });

    expect(response.status).toBe(204);
    const updated = await TriggerResource.fetchById(editorAuth, trigger.sId);
    expect(updated?.status).toBe("disabled_by_manager");
  });

  it("lets a manager re-enable an admin-locked trigger", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "manager",
    });
    const editorAuth = await createOtherEditorAuth(workspace);
    const agent = await AgentConfigurationFactory.createTestAgent(editorAuth);
    const trigger = await TriggerFactory.webhook(editorAuth, {
      agentConfigurationId: agent.sId,
      status: "disabled_by_manager",
    });

    const response = await patchStatus(workspace, trigger.sId, {
      status: "enabled",
    });

    expect(response.status).toBe(204);
    const updated = await TriggerResource.fetchById(editorAuth, trigger.sId);
    expect(updated?.status).toBe("enabled");
  });

  it("rejects a member who is neither admin nor editor", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "user",
    });
    const editorAuth = await createOtherEditorAuth(workspace);
    const agent = await AgentConfigurationFactory.createTestAgent(editorAuth);
    const trigger = await TriggerFactory.webhook(editorAuth, {
      agentConfigurationId: agent.sId,
      status: "enabled",
    });

    const response = await patchStatus(workspace, trigger.sId, {
      status: "disabled",
    });

    expect(response.status).toBe(403);
    const updated = await TriggerResource.fetchById(editorAuth, trigger.sId);
    expect(updated?.status).toBe("enabled");
  });

  it.each<{ status: TriggerStatus; target: "enabled" | "disabled" }>([
    { status: "relocating", target: "enabled" },
    { status: "relocating", target: "disabled" },
    { status: "downgraded", target: "enabled" },
    { status: "downgraded", target: "disabled" },
  ])("rejects toggling a $status trigger to $target", async ({
    status,
    target,
  }) => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await TriggerFactory.webhook(auth, {
      agentConfigurationId: agent.sId,
      status,
    });

    const response = await patchStatus(workspace, trigger.sId, {
      status: target,
    });

    expect(response.status).toBe(400);
    const updated = await TriggerResource.fetchById(auth, trigger.sId);
    expect(updated?.status).toBe(status);
  });

  it("returns 404 for an unknown trigger", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });

    const response = await patchStatus(workspace, "unknown", {
      status: "enabled",
    });

    expect(response.status).toBe(404);
  });

  it.each<{ body: unknown }>([
    { body: { status: "relocating" } },
    { body: { status: "disabled_by_manager" } },
  ])("rejects a status outside enabled/disabled ($body)", async ({ body }) => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await TriggerFactory.webhook(auth, {
      agentConfigurationId: agent.sId,
    });

    const response = await patchStatus(workspace, trigger.sId, body);

    expect(response.status).toBe(400);
  });
});
