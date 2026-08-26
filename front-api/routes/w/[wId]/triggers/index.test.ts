import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { faker } from "@faker-js/faker";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getTriggers(workspace: { sId: string }, aId: string) {
  return honoApp.request(`/api/w/${workspace.sId}/triggers?aId=${aId}`);
}

function postTriggers(workspace: { sId: string }, aId: string, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/triggers?aId=${aId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchTriggers(workspace: { sId: string }, aId: string, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/triggers?aId=${aId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function scheduleTriggerBody(spaceId: string | null | undefined) {
  return {
    triggers: [
      {
        name: `trigger-${faker.string.alphanumeric(8)}`,
        kind: "schedule" as const,
        customPrompt: "",
        naturalLanguageDescription: null,
        status: "disabled" as const,
        configuration: {
          type: "cron" as const,
          cron: "0 9 * * *",
          timezone: "UTC",
        },
        spaceId,
      },
    ],
  };
}

async function createScheduleTrigger(
  workspace: { sId: string },
  aId: string,
  spaceId: string | null | undefined
) {
  const createRes = await postTriggers(
    workspace,
    aId,
    scheduleTriggerBody(spaceId)
  );
  expect(createRes.status).toBe(204);

  const listRes = await getTriggers(workspace, aId);
  const { triggers } = await listRes.json();
  return triggers[triggers.length - 1];
}

describe("POST /api/w/:wId/triggers (spaceId)", () => {
  it("creates a trigger scoped to an open pod", async () => {
    const { workspace, user, globalGroup } = await createPrivateApiMockRequest({
      method: "POST",
      role: "builder",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const openPod = await SpaceResource.makeNew(
      auth,
      {
        name: `open-pod-${faker.string.alphanumeric(8)}`,
        kind: "project",
        workspaceId: workspace.id,
      },
      { members: [globalGroup] }
    );

    const response = await postTriggers(
      workspace,
      agent.sId,
      scheduleTriggerBody(openPod.sId)
    );

    expect(response.status).toBe(204);
  });

  it("creates a trigger scoped to a restricted pod the user is a member of", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "builder",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const memberPod = await SpaceFactory.project(workspace, user.id);

    const response = await postTriggers(
      workspace,
      agent.sId,
      scheduleTriggerBody(memberPod.sId)
    );

    expect(response.status).toBe(204);
  });

  it("rejects a restricted pod the user is not a member of", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "builder",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const otherUser = await UserFactory.basic();
    const restrictedPod = await SpaceFactory.project(workspace, otherUser.id);

    const response = await postTriggers(
      workspace,
      agent.sId,
      scheduleTriggerBody(restrictedPod.sId)
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.type).toBe("invalid_request_error");
  });

  it("rejects a space that is not a Pod", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "builder",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const regularSpace = await SpaceFactory.regular(workspace);

    const response = await postTriggers(
      workspace,
      agent.sId,
      scheduleTriggerBody(regularSpace.sId)
    );

    expect(response.status).toBe(400);
  });

  it("creates a trigger with no pod (backward compatible default)", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "builder",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const response = await postTriggers(
      workspace,
      agent.sId,
      scheduleTriggerBody(null)
    );

    expect(response.status).toBe(204);
  });

  it("rejects a Pod that does not exist", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "builder",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const response = await postTriggers(
      workspace,
      agent.sId,
      scheduleTriggerBody("space_does_not_exist")
    );

    expect(response.status).toBe(400);
  });
});

describe("PATCH /api/w/:wId/triggers (spaceId)", () => {
  it("updates an existing trigger to run inside a Pod", async () => {
    const { workspace, user, globalGroup } = await createPrivateApiMockRequest({
      method: "POST",
      role: "builder",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await createScheduleTrigger(workspace, agent.sId, null);
    const openPod = await SpaceResource.makeNew(
      auth,
      {
        name: `open-pod-${faker.string.alphanumeric(8)}`,
        kind: "project",
        workspaceId: workspace.id,
      },
      { members: [globalGroup] }
    );

    const response = await patchTriggers(workspace, agent.sId, {
      triggers: [{ ...trigger, sId: trigger.sId, spaceId: openPod.sId }],
    });

    expect(response.status).toBe(204);
    const listRes = await getTriggers(workspace, agent.sId);
    const { triggers } = await listRes.json();
    const updated = triggers.find(
      (t: { sId: string }) => t.sId === trigger.sId
    );
    expect(updated.spaceId).toBe(openPod.sId);
  });

  it("rejects updating a trigger to a Pod the user is not a member of", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "builder",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await createScheduleTrigger(workspace, agent.sId, null);
    const otherUser = await UserFactory.basic();
    const restrictedPod = await SpaceFactory.project(workspace, otherUser.id);

    const response = await patchTriggers(workspace, agent.sId, {
      triggers: [{ ...trigger, sId: trigger.sId, spaceId: restrictedPod.sId }],
    });

    expect(response.status).toBe(400);
  });
});

describe("PATCH /api/w/:wId/triggers (disabled_by_manager)", () => {
  async function createAdminLockedTrigger(
    workspace: { sId: string },
    aId: string
  ) {
    const trigger = await createScheduleTrigger(workspace, aId, null);
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const resource = await TriggerResource.fetchById(adminAuth, trigger.sId);
    const disableRes = await resource?.disable(
      adminAuth,
      "disabled_by_manager"
    );
    expect(disableRes?.isOk()).toBe(true);
    return trigger;
  }

  it("rejects a non-admin editor re-enabling an admin-locked trigger", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "builder",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await createAdminLockedTrigger(workspace, agent.sId);

    const response = await patchTriggers(workspace, agent.sId, {
      triggers: [{ ...trigger, sId: trigger.sId, status: "enabled" }],
    });

    expect(response.status).toBe(403);
    const updated = await TriggerResource.fetchById(auth, trigger.sId);
    expect(updated?.status).toBe("disabled_by_manager");
  });

  it("rejects a non-admin editor re-enabling a relocating trigger", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "builder",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await createScheduleTrigger(workspace, agent.sId, null);
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const resource = await TriggerResource.fetchById(adminAuth, trigger.sId);
    const disableRes = await resource?.disable(adminAuth, "relocating");
    expect(disableRes?.isOk()).toBe(true);

    const response = await patchTriggers(workspace, agent.sId, {
      triggers: [{ ...trigger, sId: trigger.sId, status: "enabled" }],
    });

    expect(response.status).toBe(400);
    const updated = await TriggerResource.fetchById(auth, trigger.sId);
    expect(updated?.status).toBe("relocating");
  });

  it("rejects even an admin moving a trigger out of a system-owned status", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await createScheduleTrigger(workspace, agent.sId, null);
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const resource = await TriggerResource.fetchById(adminAuth, trigger.sId);
    const disableRes = await resource?.disable(adminAuth, "downgraded");
    expect(disableRes?.isOk()).toBe(true);

    const response = await patchTriggers(workspace, agent.sId, {
      triggers: [{ ...trigger, sId: trigger.sId, status: "enabled" }],
    });

    expect(response.status).toBe(400);
    const updated = await TriggerResource.fetchById(auth, trigger.sId);
    expect(updated?.status).toBe("downgraded");
  });

  it("rejects even an admin moving a trigger into a system-owned status", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await createScheduleTrigger(workspace, agent.sId, null);

    const response = await patchTriggers(workspace, agent.sId, {
      triggers: [{ ...trigger, sId: trigger.sId, status: "relocating" }],
    });

    expect(response.status).toBe(400);
  });

  it("lets an editor save other fields of a system-disabled trigger, status echoed unchanged", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "builder",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await createScheduleTrigger(workspace, agent.sId, null);
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const resource = await TriggerResource.fetchById(adminAuth, trigger.sId);
    const disableRes = await resource?.disable(adminAuth, "downgraded");
    expect(disableRes?.isOk()).toBe(true);

    const response = await patchTriggers(workspace, agent.sId, {
      triggers: [
        {
          ...trigger,
          sId: trigger.sId,
          name: "renamed-downgraded-trigger",
          status: "downgraded",
        },
      ],
    });

    expect(response.status).toBe(204);
    const updated = await TriggerResource.fetchById(auth, trigger.sId);
    expect(updated?.name).toBe("renamed-downgraded-trigger");
    expect(updated?.status).toBe("downgraded");
  });

  it("keeps the update()/enable() asymmetry restore jobs rely on", async () => {
    // update() refuses system-status transitions for everyone, while enable()
    // allows them for admins: this is what lets enableAllForWorkspace restore
    // downgraded/relocating triggers. Do not "unify" these paths.
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await TriggerFactory.webhook(auth, {
      agentConfigurationId: agent.sId,
      status: "downgraded",
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const updateRes = await TriggerResource.update(adminAuth, trigger.sId, {
      status: "enabled",
    });
    expect(updateRes.isErr()).toBe(true);

    const enableRes = await trigger.enable(adminAuth);
    expect(enableRes?.isOk()).toBe(true);
    const restored = await TriggerResource.fetchById(adminAuth, trigger.sId);
    expect(restored?.status).toBe("enabled");
  });

  it("lets a non-admin editor edit other fields of an admin-locked trigger", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "builder",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await createAdminLockedTrigger(workspace, agent.sId);

    const response = await patchTriggers(workspace, agent.sId, {
      triggers: [
        {
          ...trigger,
          sId: trigger.sId,
          name: "renamed-trigger",
          status: "disabled_by_manager",
        },
      ],
    });

    expect(response.status).toBe(204);
    const updated = await TriggerResource.fetchById(auth, trigger.sId);
    expect(updated?.name).toBe("renamed-trigger");
    expect(updated?.status).toBe("disabled_by_manager");
  });
});

describe("POST/PATCH /api/w/:wId/triggers (executionMode)", () => {
  it("creates a trigger on the workspace pool for a permitted admin", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const body = scheduleTriggerBody(null);
    const response = await postTriggers(workspace, agent.sId, {
      triggers: [{ ...body.triggers[0], executionMode: "workspace_pool" }],
    });

    expect(response.status).toBe(204);
    const triggers = await TriggerResource.listByAgentConfigurationId(
      auth,
      agent.sId
    );
    expect(triggers[0].executionMode).toBe("workspace_pool");
  });

  it("rejects creating a workspace pool trigger without the permission", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "builder",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const body = scheduleTriggerBody(null);
    const response = await postTriggers(workspace, agent.sId, {
      triggers: [{ ...body.triggers[0], executionMode: "workspace_pool" }],
    });

    expect(response.status).toBe(403);
  });

  it("moves an existing trigger to the workspace pool on update", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await createScheduleTrigger(workspace, agent.sId, null);

    const body = scheduleTriggerBody(null);
    const response = await patchTriggers(workspace, agent.sId, {
      triggers: [
        {
          ...body.triggers[0],
          sId: trigger.sId,
          executionMode: "workspace_pool",
        },
      ],
    });

    expect(response.status).toBe(204);
    const updated = await TriggerResource.fetchById(auth, trigger.sId);
    expect(updated?.executionMode).toBe("workspace_pool");
  });

  it("rejects an update to the workspace pool without the permission", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "builder",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await createScheduleTrigger(workspace, agent.sId, null);

    const body = scheduleTriggerBody(null);
    const response = await patchTriggers(workspace, agent.sId, {
      triggers: [
        {
          ...body.triggers[0],
          sId: trigger.sId,
          executionMode: "workspace_pool",
        },
      ],
    });

    expect(response.status).toBe(403);
    const updated = await TriggerResource.fetchById(auth, trigger.sId);
    expect(updated?.executionMode).toBe("user_pool");
  });

  it("keeps the pool untouched when the update omits executionMode", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const trigger = await TriggerFactory.schedule(auth, {
      agentConfigurationId: agent.sId,
      configuration: { type: "cron", cron: "0 9 * * *", timezone: "UTC" },
      executionMode: "workspace_pool",
    });

    const body = scheduleTriggerBody(null);
    const response = await patchTriggers(workspace, agent.sId, {
      triggers: [{ ...body.triggers[0], sId: trigger.sId }],
    });

    expect(response.status).toBe(204);
    const updated = await TriggerResource.fetchById(auth, trigger.sId);
    expect(updated?.executionMode).toBe("workspace_pool");
  });
});
