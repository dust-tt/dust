import type { RequestMethod } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillConfigurationFactory } from "@app/tests/utils/SkillConfigurationFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";

import handler from "./index";

async function setupTest(
  options: {
    skillOwnerRole?: "admin" | "builder" | "user";
    requestUserRole?: "admin" | "builder" | "user";
    method?: RequestMethod;
  } = {}
) {
  const skillOwnerRole = options.skillOwnerRole ?? "admin";
  const requestUserRole = options.requestUserRole ?? "admin";
  const method = options.method ?? "GET";

  // Create workspace, requesting user and auth based on requestUserRole
  const {
    req,
    res,
    workspace,
    user: requestUser,
  } = await createPrivateApiMockRequest({
    role: requestUserRole,
    method: method,
  });

  // Enable skills feature flag for the workspace
  await FeatureFlagFactory.basic("skills", workspace);

  // Create default spaces (including system space required for PATCH operations)
  // We need an admin auth to create spaces, so create a temporary admin if needed
  if (requestUserRole === "admin") {
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      requestUser.sId,
      workspace.sId
    );
    await SpaceFactory.defaults(adminAuth);
  } else {
    // Create a temporary admin user to set up spaces
    const adminUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );
    await SpaceFactory.defaults(adminAuth);
  }

  let requestUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
    requestUser.sId,
    workspace.sId
  );

  // Create skill owner (might be the same as requestUser or different)
  let skillOwner: UserResource;
  let skillOwnerAuth: Authenticator;
  if (requestUserRole === skillOwnerRole) {
    skillOwner = requestUser;
    skillOwnerAuth = requestUserAuth;
  } else {
    skillOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, skillOwner, {
      role: skillOwnerRole,
    });
    skillOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      skillOwner.sId,
      workspace.sId
    );
  }

  // Create skill owned by skillOwner
  const skillModel = await SkillConfigurationFactory.create(skillOwnerAuth);
  const skill = await SkillResource.fetchByModelIdWithAuth(
    skillOwnerAuth,
    skillModel.id
  );
  if (!skill) {
    throw new Error("Failed to create skill");
  }

  // Regenerate auth to pick up the new group membership
  skillOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    skillOwner.sId,
    workspace.sId
  );
  requestUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
    requestUser.sId,
    workspace.sId
  );

  // Set up query parameters for the skill
  req.query = { ...req.query, wId: workspace.sId, sId: skill.sId };

  return {
    req,
    res,
    workspace,
    skillOwner,
    skillOwnerAuth,
    skill,
    requestUser,
    requestUserAuth,
    requestUserRole,
  };
}

describe("GET /api/w/[wId]/skills/[sId]", () => {
  it("should return 200 and the skill configuration for admin", async () => {
    const { req, res, skill } = await setupTest({
      requestUserRole: "admin",
    });

    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data).toHaveProperty("skill");
    expect(data.skill.sId).toBe(skill.sId);
    expect(data.skill.name).toBe("Test Skill");
  });

  it("should return 404 for non-existent skill", async () => {
    const { req, res } = await setupTest();
    req.query.sId = "non_existent_skill_sid";

    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "skill_not_found",
        message: "The skill you're trying to access was not found.",
      },
    });
  });
});

describe("PATCH /api/w/[wId]/skills/[sId]", () => {
  it("should return 403 for non-editor user", async () => {
    const { req, res } = await setupTest({
      skillOwnerRole: "builder",
      requestUserRole: "user",
      method: "PATCH",
    });

    req.body = {
      name: "Unauthorized Update",
      agentFacingDescription: "Agent description",
      userFacingDescription: "User description",
      instructions: "Instructions",
      icon: null,
      tools: [],
    };

    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "app_auth_error",
        message: "User is not a builder.",
      },
    });
  });

  it("should return 400 for duplicate skill name", async () => {
    const { req, res, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
      method: "PATCH",
    });

    // Create another skill with a different name
    await SkillConfigurationFactory.create(requestUserAuth, {
      name: "Other Skill",
    });

    // Try to update the skill name to the duplicate name
    req.body = {
      name: "Other Skill",
      agentFacingDescription: "Agent description",
      userFacingDescription: "User description",
      instructions: "Instructions",
      icon: null,
      tools: [],
    };

    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: 'A skill with the name "Other Skill" already exists.',
      },
    });
  });

  it("should return 400 for invalid MCP server view ID", async () => {
    const { req, res } = await setupTest({
      requestUserRole: "admin",
      method: "PATCH",
    });

    req.body = {
      name: "Updated Skill",
      agentFacingDescription: "Agent description",
      userFacingDescription: "User description",
      instructions: "Instructions",
      icon: null,
      tools: [{ mcpServerViewId: "invalid_id" }],
    };

    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
    expect(res._getJSONData().error.message).toContain("Invalid MCP server");
  });

  it("should return 400 for invalid request body", async () => {
    const { req, res } = await setupTest({
      requestUserRole: "admin",
      method: "PATCH",
    });

    req.body = {
      // Missing required fields
      name: "Updated Skill",
    };

    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("should successfully update the description", async () => {
    const { req, res, skill, requestUserAuth } = await setupTest({
      requestUserRole: "admin",
      method: "PATCH",
    });

    const newDescription = "Updated description for the skill";
    req.body = {
      name: skill.name,
      agentFacingDescription: newDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      icon: null,
      tools: [],
    };

    await handler(req, res);

    const data = res._getJSONData();
    expect(data).not.toHaveProperty("error");
    expect(res._getStatusCode()).toBe(200);
    expect(data).toHaveProperty("skill");
    expect(data.skill.sId).toBe(skill.sId);
    expect(data.skill.agentFacingDescription).toBe(newDescription);

    // Verify the update persisted by fetching the resource
    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill).not.toBeNull();
    expect(updatedSkill?.agentFacingDescription).toBe(newDescription);
  });

  it("should update requestedSpaceIds when adding a tool from a new space", async () => {
    const { req, res, skill, workspace, requestUser, requestUserAuth } =
      await setupTest({
        requestUserRole: "admin",
        method: "PATCH",
      });

    // Create two regular spaces
    const space1 = await SpaceFactory.regular(workspace);
    await space1.addMembers(requestUserAuth, { userIds: [requestUser.sId] });
    const space2 = await SpaceFactory.regular(workspace);
    await space2.addMembers(requestUserAuth, { userIds: [requestUser.sId] });
    await requestUserAuth.refresh();

    // Create MCP servers and views in each space
    const server1 = await RemoteMCPServerFactory.create(workspace, {
      name: "Server 1",
    });
    const server2 = await RemoteMCPServerFactory.create(workspace, {
      name: "Server 2",
    });

    const serverView1 = await MCPServerViewFactory.create(
      workspace,
      server1.sId,
      space1
    );
    const serverView2 = await MCPServerViewFactory.create(
      workspace,
      server2.sId,
      space2
    );

    // Update skill with both tools
    req.body = {
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      icon: null,
      tools: [
        { mcpServerViewId: serverView1.sId },
        { mcpServerViewId: serverView2.sId },
      ],
    };

    await handler(req, res);

    const data = res._getJSONData();
    expect(data).not.toHaveProperty("error");
    expect(res._getStatusCode()).toBe(200);
    expect(data.skill.tools).toHaveLength(2);
    expect(data.skill.requestedSpaceIds).toHaveLength(2);
    expect(data.skill.requestedSpaceIds).toContain(space1.sId);
    expect(data.skill.requestedSpaceIds).toContain(space2.sId);

    // Verify the update persisted in the database
    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill).not.toBeNull();
    expect(updatedSkill?.requestedSpaceIds).toHaveLength(2);
  });

  it("should correctly reflect updated tools in the response", async () => {
    const { req, res, skill, workspace, requestUser, requestUserAuth } =
      await setupTest({
        requestUserRole: "admin",
        method: "PATCH",
      });

    // Create a regular space with an MCP server view
    const space = await SpaceFactory.regular(workspace);
    await space.addMembers(requestUserAuth, { userIds: [requestUser.sId] });
    await requestUserAuth.refresh();
    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Test Server",
    });
    const serverView = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      space
    );

    // Update skill with the tool
    req.body = {
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      icon: null,
      tools: [{ mcpServerViewId: serverView.sId }],
    };

    await handler(req, res);

    const data = res._getJSONData();
    expect(data).not.toHaveProperty("error");
    expect(res._getStatusCode()).toBe(200);

    // Verify the response contains the updated tools
    expect(data.skill.tools).toHaveLength(1);
    expect(data.skill.tools[0].sId).toBe(serverView.sId);

    // Verify fetching the skill also shows the tool
    const updatedSkill = await SkillResource.fetchById(
      requestUserAuth,
      skill.sId
    );
    expect(updatedSkill).not.toBeNull();
    expect(updatedSkill?.toJSON(requestUserAuth).tools).toHaveLength(1);
    expect(updatedSkill?.toJSON(requestUserAuth).tools[0].sId).toBe(
      serverView.sId
    );
  });
});

describe("DELETE /api/w/[wId]/skills/[sId]", () => {
  it("should return 403 for non-editor user", async () => {
    const { req, res } = await setupTest({
      skillOwnerRole: "builder",
      requestUserRole: "user",
      method: "DELETE",
    });

    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "app_auth_error",
        message: "User is not a builder.",
      },
    });
  });

  it("should return 404 for non-existent skill", async () => {
    const { req, res } = await setupTest({ method: "DELETE" });
    req.query.sId = "non_existent_skill_sid";

    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "skill_not_found",
        message: "The skill you're trying to access was not found.",
      },
    });
  });
});

describe("Method Support /api/w/[wId]/skills/[sId]", () => {
  it("only supports GET, PATCH, and DELETE methods", async () => {
    for (const method of ["POST", "PUT"] as const) {
      const { req, res } = await setupTest({ method });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, PATCH or DELETE is expected.",
        },
      });
    }
  });
});
