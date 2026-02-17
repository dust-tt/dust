import { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it } from "vitest";

import handler from "./editors";

describe("PATCH /api/w/[wId]/skills/[sId]/editors", () => {
  it("allows adding builder as editor", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
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

    const skill = await SkillFactory.create(auth);

    const builderUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, builderUser, {
      role: "builder",
    });

    req.query.sId = skill.sId;
    req.body = { addEditorIds: [builderUser.sId] };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.editors).toHaveLength(2); // admin + builder
    expect(data.editors.map((e: any) => e.sId)).toContain(builderUser.sId);
  });

  it("allows adding admin as editor", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
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

    const skill = await SkillFactory.create(auth);

    const adminUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });

    req.query.sId = skill.sId;
    req.body = { addEditorIds: [adminUser.sId] };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.editors).toHaveLength(2); // 2 admins
    expect(data.editors.map((e: any) => e.sId)).toContain(adminUser.sId);
  });

  it("rejects adding regular user as editor", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
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

    const skill = await SkillFactory.create(auth);

    const regularUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, regularUser, { role: "user" });

    req.query.sId = skill.sId;
    req.body = { addEditorIds: [regularUser.sId] };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const data = res._getJSONData();
    expect(data.error.type).toBe("workspace_auth_error");
  });

  it("rejects mixed batch (builder + user)", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
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

    const skill = await SkillFactory.create(auth);

    const builderUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, builderUser, {
      role: "builder",
    });

    const regularUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, regularUser, { role: "user" });

    req.query.sId = skill.sId;
    req.body = { addEditorIds: [builderUser.sId, regularUser.sId] };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const data = res._getJSONData();
    expect(data.error.type).toBe("workspace_auth_error");
  });

  it("allows removing any editor regardless of role", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
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

    const skill = await SkillFactory.create(auth);

    // Remove the creator (admin user)
    req.query.sId = skill.sId;
    req.body = { removeEditorIds: [user.sId] };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.editors).toHaveLength(0);
  });

  it("GET endpoint returns all editors", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
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

    const skill = await SkillFactory.create(auth);

    req.query.sId = skill.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.editors).toHaveLength(1); // Creator is editor
    expect(data.editors[0].sId).toBe(user.sId);
  });
});
