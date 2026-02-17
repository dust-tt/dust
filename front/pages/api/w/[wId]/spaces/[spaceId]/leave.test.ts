import { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import type { WorkspaceType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";
import type { MockRequest, MockResponse } from "node-mocks-http";
import { describe, expect, it } from "vitest";

import handler from "./leave";

describe("POST /api/w/[wId]/spaces/[spaceId]/leave", () => {
  // Shared test context
  let req: MockRequest<NextApiRequest>;
  let res: MockResponse<NextApiResponse>;
  let workspace: WorkspaceType;
  let user: UserResource;
  let adminAuth: Authenticator;

  // Helper to set up request context
  async function setupRequest(options: {
    method?: string;
    role?: MembershipRoleType;
  }) {
    const result = await createPrivateApiMockRequest({
      method: (options.method ?? "POST") as any,
      role: options.role ?? "user",
    });
    req = result.req;
    res = result.res;
    workspace = result.workspace;
    user = result.user;
    adminAuth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    return result;
  }

  // Helper to add user to a project
  async function addUserToProject(
    project: SpaceResource,
    targetUser: UserResource,
    options: { asEditor?: boolean } = {}
  ) {
    const memberGroup = project.groups.find((g) => g.kind === "regular");
    const editorGroup = project.groups.find((g) => g.kind === "space_editors");

    if (memberGroup) {
      await memberGroup.dangerouslyAddMembers(adminAuth, {
        users: [targetUser.toJSON()],
      });
    }
    if (options.asEditor && editorGroup) {
      await editorGroup.dangerouslyAddMembers(adminAuth, {
        users: [targetUser.toJSON()],
      });
    }
  }

  describe("validation", () => {
    it("should return 400 when space is not a project", async () => {
      await setupRequest({ role: "user" });

      const regularSpace = await SpaceFactory.regular(workspace);
      const memberGroup = regularSpace.groups.find((g) => g.kind === "regular");
      if (memberGroup) {
        await memberGroup.dangerouslyAddMembers(adminAuth, {
          users: [user.toJSON()],
        });
      }

      req.query.spaceId = regularSpace.sId;
      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
      expect(res._getJSONData().error.message).toContain("only leave projects");
    });

    it("should return 403 when user is not a member of the project", async () => {
      await setupRequest({ role: "admin" }); // Admin can access but won't be a member

      const otherUser = await UserFactory.basic();
      const project = await SpaceFactory.project(workspace, otherUser.id);

      req.query.spaceId = project.sId;
      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().error.type).toBe("workspace_auth_error");
      expect(res._getJSONData().error.message).toContain("not a member");
    });

    it("should return 405 for unsupported methods", async () => {
      for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
        await setupRequest({ method, role: "user" });

        const otherEditor = await UserFactory.basic();
        const project = await SpaceFactory.project(workspace, otherEditor.id);
        await addUserToProject(project, user, { asEditor: true });

        req.query.spaceId = project.sId;
        await handler(req, res);

        expect(res._getStatusCode()).toBe(405);
        expect(res._getJSONData().error.type).toBe(
          "method_not_supported_error"
        );
      }
    });
  });

  describe("last editor protection", () => {
    it("should return 403 when user is the last editor", async () => {
      await setupRequest({ role: "user" });

      // User is created as the only editor via SpaceFactory
      const project = await SpaceFactory.project(workspace, user.id);
      await addUserToProject(project, user); // Add to member group only

      req.query.spaceId = project.sId;
      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().error.type).toBe("workspace_auth_error");
      expect(res._getJSONData().error.message).toContain("last editor");
    });
  });

  describe("successful leave", () => {
    it("should return 200 when editor leaves project with multiple editors", async () => {
      await setupRequest({ role: "user" });

      // Create another editor and make them a workspace member
      const otherEditor = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherEditor, {
        role: "user",
      });

      const project = await SpaceFactory.project(workspace, otherEditor.id);
      await addUserToProject(project, user, { asEditor: true });

      req.query.spaceId = project.sId;
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().success).toBe(true);

      const memberGroup = project.groups.find((g) => g.kind === "regular");
      if (memberGroup) {
        const isMember = await memberGroup.isMember(user);
        expect(isMember).toBe(false);
      }
    });

    it("should return 200 when non-editor member leaves project", async () => {
      await setupRequest({ role: "user" });

      const editorUser = await UserFactory.basic();
      const project = await SpaceFactory.project(workspace, editorUser.id);
      await addUserToProject(project, user, { asEditor: false });

      req.query.spaceId = project.sId;
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().success).toBe(true);
    });
  });
});
