import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function patchExecutionMode(
  workspace: { sId: string },
  tId: string,
  body: unknown
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/triggers/${tId}/execution_mode`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

async function createOtherEditorAuth(workspace: WorkspaceType) {
  const otherUser = await UserFactory.basic();
  await MembershipFactory.associate(workspace, otherUser, { role: "user" });
  return Authenticator.fromUserIdAndWorkspaceId(otherUser.sId, workspace.sId);
}

async function grantWorkspacePoolToEverybody(workspace: WorkspaceType) {
  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  await GroupPermissionResource.setForEverybody(adminAuth, {
    grantType: "use_workspace_pool",
    resourceType: "trigger",
  });
}

describe("PATCH /api/w/:wId/triggers/:tId/execution_mode", () => {
  it("lets an admin move a trigger to the workspace pool", async () => {
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

    const response = await patchExecutionMode(workspace, trigger.sId, {
      executionMode: "workspace_pool",
    });

    expect(response.status).toBe(204);
    const updated = await TriggerResource.fetchById(auth, trigger.sId);
    expect(updated?.executionMode).toBe("workspace_pool");
  });

  it("lets the editor move their own trigger back to their own pool", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "user",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    await grantWorkspacePoolToEverybody(workspace);
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await TriggerFactory.webhook(auth, {
      agentConfigurationId: agent.sId,
      executionMode: "workspace_pool",
    });

    const response = await patchExecutionMode(workspace, trigger.sId, {
      executionMode: "user_pool",
    });

    expect(response.status).toBe(204);
    const updated = await TriggerResource.fetchById(auth, trigger.sId);
    expect(updated?.executionMode).toBe("user_pool");
  });

  it("rejects a member without the workspace pool permission", async () => {
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

    const response = await patchExecutionMode(workspace, trigger.sId, {
      executionMode: "workspace_pool",
    });

    expect(response.status).toBe(403);
    const updated = await TriggerResource.fetchById(auth, trigger.sId);
    expect(updated?.executionMode).toBe("user_pool");
  });

  it("rejects a member who is neither manager nor editor", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "user",
    });
    await grantWorkspacePoolToEverybody(workspace);
    const editorAuth = await createOtherEditorAuth(workspace);
    const agent = await AgentConfigurationFactory.createTestAgent(editorAuth);
    const trigger = await TriggerFactory.webhook(editorAuth, {
      agentConfigurationId: agent.sId,
      executionMode: "workspace_pool",
    });

    const response = await patchExecutionMode(workspace, trigger.sId, {
      executionMode: "user_pool",
    });

    expect(response.status).toBe(403);
    const updated = await TriggerResource.fetchById(editorAuth, trigger.sId);
    expect(updated?.executionMode).toBe("workspace_pool");
  });

  it("returns 404 when the feature flag is off", async () => {
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

    const response = await patchExecutionMode(workspace, trigger.sId, {
      executionMode: "workspace_pool",
    });

    expect(response.status).toBe(404);
  });

  it("returns 404 for an unknown trigger", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const response = await patchExecutionMode(workspace, "unknown", {
      executionMode: "workspace_pool",
    });

    expect(response.status).toBe(404);
  });

  it("rejects an unknown execution mode", async () => {
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

    const response = await patchExecutionMode(workspace, trigger.sId, {
      executionMode: "team_pool",
    });

    expect(response.status).toBe(400);
  });
});
