import { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setup() {
  const { workspace, user } = await createPrivateApiMockRequest({
    method: "PATCH",
    role: "admin",
  });
  const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
  const auth = new Authenticator({
    user,
    role: "admin",
    groupModelIds: [],
    workspace: workspaceResource,
    subscription: null,
    authMethod: "internal",
  });
  return { workspace, user, auth };
}

function patch(workspace: { sId: string }, sId: string, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/skills/${sId}/editors`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function get(workspace: { sId: string }, sId: string) {
  return honoApp.request(`/api/w/${workspace.sId}/skills/${sId}/editors`);
}

describe("PATCH /api/w/:wId/skills/:sId/editors", () => {
  it("allows adding builder as editor", async () => {
    const { workspace, auth } = await setup();

    const skill = await SkillFactory.create(auth);

    const builderUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, builderUser, {
      role: "builder",
    });

    const response = await patch(workspace, skill.sId, {
      addEditorIds: [builderUser.sId],
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.editors).toHaveLength(2); // admin + builder
    expect(data.editors.map((e: { sId: string }) => e.sId)).toContain(
      builderUser.sId
    );
  });

  it("allows adding admin as editor", async () => {
    const { workspace, auth } = await setup();

    const skill = await SkillFactory.create(auth);

    const adminUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });

    const response = await patch(workspace, skill.sId, {
      addEditorIds: [adminUser.sId],
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.editors).toHaveLength(2);
    expect(data.editors.map((e: { sId: string }) => e.sId)).toContain(
      adminUser.sId
    );
  });

  it("rejects adding regular user as editor", async () => {
    const { workspace, auth } = await setup();

    const skill = await SkillFactory.create(auth);

    const regularUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, regularUser, { role: "user" });

    const response = await patch(workspace, skill.sId, {
      addEditorIds: [regularUser.sId],
    });

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error.type).toBe("workspace_auth_error");
  });

  it("rejects mixed batch (builder + user)", async () => {
    const { workspace, auth } = await setup();

    const skill = await SkillFactory.create(auth);

    const builderUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, builderUser, {
      role: "builder",
    });

    const regularUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, regularUser, { role: "user" });

    const response = await patch(workspace, skill.sId, {
      addEditorIds: [builderUser.sId, regularUser.sId],
    });

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error.type).toBe("workspace_auth_error");
  });

  it("allows removing any editor regardless of role", async () => {
    const { workspace, user, auth } = await setup();

    const skill = await SkillFactory.create(auth);

    const response = await patch(workspace, skill.sId, {
      removeEditorIds: [user.sId],
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.editors).toHaveLength(0);
  });

  it("GET endpoint returns all editors", async () => {
    const { workspace, user, auth } = await setup();

    const skill = await SkillFactory.create(auth);

    const response = await get(workspace, skill.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.editors).toHaveLength(1); // Creator is editor
    expect(data.editors[0].sId).toBe(user.sId);
  });
});
