import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { faker } from "@faker-js/faker";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getTriggers(workspace: { sId: string }, aId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/triggers`
  );
}

function postTriggers(workspace: { sId: string }, aId: string, body: unknown) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/triggers`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function patchTriggers(workspace: { sId: string }, aId: string, body: unknown) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/triggers`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
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

describe("POST /api/w/:wId/assistant/agent_configurations/:aId/triggers (spaceId)", () => {
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

describe("PATCH /api/w/:wId/assistant/agent_configurations/:aId/triggers (spaceId)", () => {
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
