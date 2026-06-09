import { updateAgentPermissions } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import type { UserResource } from "@app/lib/resources/user_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { UserType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/recent_authors", () => ({
  agentConfigurationWasUpdatedBy: vi.fn(),
}));

async function setupTest(
  options: {
    agentOwnerRole?: "admin" | "builder" | "user";
    requestUserRole?: "admin" | "builder" | "user";
  } = {}
) {
  const agentOwnerRole = options.agentOwnerRole ?? "admin";
  const requestUserRole = options.requestUserRole ?? "admin";

  const { workspace, user: requestUser } = await createPrivateApiMockRequest({
    role: requestUserRole,
  });

  let agentOwner: UserResource;
  let agentOwnerAuth: Authenticator;
  if (requestUserRole === agentOwnerRole) {
    agentOwner = requestUser;
    agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      requestUser.sId,
      workspace.sId
    );
  } else {
    agentOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, agentOwner, {
      role: agentOwnerRole,
    });
    agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      agentOwner.sId,
      workspace.sId
    );
  }

  const agent = await AgentConfigurationFactory.createTestAgent(agentOwnerAuth);

  return { workspace, agentOwner, agent, requestUser };
}

function getEditors(workspace: { sId: string }, aId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/editors`
  );
}

function patchEditors(workspace: { sId: string }, aId: string, body: unknown) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/editors`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("GET /api/w/:wId/assistant/agent_configurations/:aId/editors", () => {
  it("should return 200 and the editor list for admin", async () => {
    const { workspace, agent, agentOwner } = await setupTest({
      requestUserRole: "admin",
    });

    const response = await getEditors(workspace, agent.sId);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("editors");
    expect(data.editors).toBeInstanceOf(Array);
    expect(data.editors).toHaveLength(1);
    expect(data.editors[0].id).toBe(agentOwner.id);
  });

  it("should return 200 and only light user fields for non-admin editor", async () => {
    const { workspace, agent, agentOwner } = await setupTest({
      agentOwnerRole: "builder",
      requestUserRole: "builder",
    });

    const response = await getEditors(workspace, agent.sId);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.editors).toHaveLength(1);
    expect(data.editors[0].sId).toBe(agentOwner.sId);

    // Non-admin receives only minimal essential fields; admin-only fields are absent.
    expect(data.editors[0].email).toBeDefined();
    expect(data.editors[0].id).toBeUndefined();
    expect(data.editors[0].provider).toBeUndefined();
    expect(data.editors[0].username).toBeUndefined();
  });

  it("should return 404 for non-existent agent", async () => {
    const { workspace } = await setupTest();

    const response = await getEditors(workspace, "non_existent_agent_sid");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  });
});

describe("PATCH /api/w/:wId/assistant/agent_configurations/:aId/editors", () => {
  it("admin should successfully add an editor", async () => {
    const { workspace, agent, agentOwner } = await setupTest({
      requestUserRole: "admin",
    });

    const newEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, newEditor, {
      role: "builder",
    });

    const response = await patchEditors(workspace, agent.sId, {
      addEditorIds: [newEditor.sId],
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.editors).toHaveLength(2);
    const editorIds = data.editors.map((e: UserType) => e.sId);
    expect(editorIds).toContain(agentOwner.sId);
    expect(editorIds).toContain(newEditor.sId);
  });

  it("admin should successfully remove an editor", async () => {
    const { workspace, agent, agentOwner } = await setupTest({
      requestUserRole: "admin",
    });

    const editorToRemove = await UserFactory.basic();
    await MembershipFactory.associate(workspace, editorToRemove, {
      role: "builder",
    });
    const agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      agentOwner.sId,
      workspace.sId
    );
    const updateRes = await updateAgentPermissions(agentOwnerAuth, {
      agent,
      usersToAdd: [editorToRemove.toJSON()],
      usersToRemove: [],
    });
    if (updateRes.isErr()) {
      throw updateRes.error;
    }

    const response = await patchEditors(workspace, agent.sId, {
      removeEditorIds: [agentOwner.sId],
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.editors).toHaveLength(1);
    expect(data.editors[0].sId).toBe(editorToRemove.sId);
  });

  it("editor should successfully add another editor and get light response", async () => {
    const { workspace, agent, agentOwner } = await setupTest({
      agentOwnerRole: "builder",
      requestUserRole: "builder",
    });

    const newEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, newEditor, { role: "user" });

    const response = await patchEditors(workspace, agent.sId, {
      addEditorIds: [newEditor.sId],
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.editors).toHaveLength(2);
    const editorIds = data.editors.map((e: { sId: string }) => e.sId);
    expect(editorIds).toContain(agentOwner.sId);
    expect(editorIds).toContain(newEditor.sId);
    // Non-admin receives minimal essential data including email.
    expect(data.editors[0].email).toBeDefined();
  });

  it("editor should successfully remove another editor", async () => {
    const { workspace, agent, agentOwner, requestUser } = await setupTest({
      agentOwnerRole: "builder",
      requestUserRole: "builder",
    });

    const editorToRemove = await UserFactory.basic();
    await MembershipFactory.associate(workspace, editorToRemove, {
      role: "admin",
    });
    const agentOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      requestUser.sId,
      workspace.sId
    );
    const updateRes = await updateAgentPermissions(agentOwnerAuth, {
      agent,
      usersToAdd: [editorToRemove.toJSON()],
      usersToRemove: [],
    });
    if (updateRes.isErr()) {
      throw updateRes.error;
    }

    const response = await patchEditors(workspace, agent.sId, {
      removeEditorIds: [editorToRemove.sId],
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.editors).toHaveLength(1);
    expect(data.editors[0].sId).toBe(agentOwner.sId);
  });

  it("should return 403 for non-editor user", async () => {
    const { workspace, agent } = await setupTest({ requestUserRole: "user" });

    const response = await patchEditors(workspace, agent.sId, {
      addEditorIds: ["some_user_sid"],
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "agent_group_permission_error",
        message:
          "Only editors of the agent or workspace admins can modify editors.",
      },
    });
  });

  it("should return 409 when adding existing editor", async () => {
    const { workspace, agent, agentOwner } = await setupTest({
      requestUserRole: "admin",
    });

    const response = await patchEditors(workspace, agent.sId, {
      addEditorIds: [agentOwner.sId],
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "The user is already a member of the agent editors group.",
      },
    });
  });

  it("should return 409 when removing non-editor", async () => {
    const { workspace, agent } = await setupTest({ requestUserRole: "admin" });

    const nonEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, nonEditor, { role: "user" });

    const response = await patchEditors(workspace, agent.sId, {
      removeEditorIds: [nonEditor.sId],
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "The user is not a member of the agent editors group.",
      },
    });
  });

  it("should return 404 when adding non-existent user", async () => {
    const { workspace, agent } = await setupTest({ requestUserRole: "admin" });

    const response = await patchEditors(workspace, agent.sId, {
      addEditorIds: ["user_not_exists_sid"],
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "user_not_found",
        message: "Some users were not found: user_not_exists_sid",
      },
    });
  });

  it("should return 404 when removing non-existent user", async () => {
    const { workspace, agent } = await setupTest({ requestUserRole: "admin" });

    const response = await patchEditors(workspace, agent.sId, {
      removeEditorIds: ["user_not_exists_sid"],
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "user_not_found",
        message: "Some users were not found: user_not_exists_sid",
      },
    });
  });

  it("should return 400 for invalid request body (empty)", async () => {
    const { workspace, agent } = await setupTest({ requestUserRole: "admin" });

    const response = await patchEditors(workspace, agent.sId, {});
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toContain(
      "Either addEditorIds or removeEditorIds must be provided"
    );
  });

  it("should return 400 for invalid request body (empty arrays)", async () => {
    const { workspace, agent } = await setupTest({ requestUserRole: "admin" });

    const response = await patchEditors(workspace, agent.sId, {
      addEditorIds: [],
      removeEditorIds: [],
    });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toContain(
      "Either addEditorIds or removeEditorIds must be provided"
    );
  });

  it("should successfully add and remove editors in same request", async () => {
    const { workspace, agent, agentOwner } = await setupTest({
      requestUserRole: "admin",
    });

    const editorToAdd = await UserFactory.basic();
    await MembershipFactory.associate(workspace, editorToAdd, {
      role: "builder",
    });

    const response = await patchEditors(workspace, agent.sId, {
      addEditorIds: [editorToAdd.sId],
      removeEditorIds: [agentOwner.sId],
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.editors).toHaveLength(1);
    expect(data.editors[0].sId).toBe(editorToAdd.sId);
  });

  it("should return 404 for non-existent agent", async () => {
    const { workspace } = await setupTest();

    const response = await patchEditors(workspace, "non_existent_agent_sid", {
      addEditorIds: ["any_user_sid"],
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  });
});
