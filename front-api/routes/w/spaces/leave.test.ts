import { describe, expect, it } from "vitest";

import { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";

import { honoApp } from "../../../app";

function leave(workspace: { sId: string }, spaceId: string) {
  return honoApp.request(`/api/w/${workspace.sId}/spaces/${spaceId}/leave`, {
    method: "POST",
  });
}

async function addUserToProject(
  adminAuth: Authenticator,
  project: SpaceResource,
  user: UserResource,
  options: { asEditor?: boolean } = {}
) {
  const memberGroup = project.groups.find((g) => g.kind === "regular");
  const editorGroup = project.groups.find((g) => g.kind === "space_editors");

  if (memberGroup) {
    await memberGroup.dangerouslyAddMembers(adminAuth, {
      users: [user.toJSON()],
    });
  }
  if (options.asEditor && editorGroup) {
    await editorGroup.dangerouslyAddMembers(adminAuth, {
      users: [user.toJSON()],
    });
  }
}

describe("POST /api/w/:wId/spaces/:spaceId/leave", () => {
  describe("validation", () => {
    it("returns 400 when space is not a project", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        role: "user",
      });
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const regularSpace = await SpaceFactory.regular(workspace);
      const memberGroup = regularSpace.groups.find((g) => g.kind === "regular");
      if (memberGroup) {
        await memberGroup.dangerouslyAddMembers(adminAuth, {
          users: [user.toJSON()],
        });
      }

      const response = await leave(workspace, regularSpace.sId);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.type).toBe("invalid_request_error");
      expect(body.error.message).toContain("only leave projects");
    });

    it("returns 403 when user is not a member of the project", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        role: "admin",
      });

      const otherUser = await UserFactory.basic();
      const project = await SpaceFactory.project(workspace, otherUser.id);

      const response = await leave(workspace, project.sId);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.type).toBe("workspace_auth_error");
      expect(body.error.message).toContain("not a member");
    });
  });

  describe("last editor protection", () => {
    it("returns 403 when user is the last editor", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        role: "user",
      });
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      // user is the only editor via SpaceFactory.project
      const project = await SpaceFactory.project(workspace, user.id);
      await addUserToProject(adminAuth, project, user); // also add to member group

      const response = await leave(workspace, project.sId);

      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error.type).toBe("workspace_auth_error");
      expect(body.error.message).toContain("last editor");
    });
  });

  describe("successful leave", () => {
    it("returns 200 when editor leaves project with multiple editors", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        role: "user",
      });
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const otherEditor = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherEditor, {
        role: "user",
      });

      const project = await SpaceFactory.project(workspace, otherEditor.id);
      await addUserToProject(adminAuth, project, user, { asEditor: true });

      const response = await leave(workspace, project.sId);

      expect(response.status).toBe(200);
      expect((await response.json()).success).toBe(true);

      const memberGroup = project.groups.find((g) => g.kind === "regular");
      if (memberGroup) {
        const isMember = await memberGroup.isMember(user);
        expect(isMember).toBe(false);
      }
    });

    it("returns 200 when non-editor member leaves project", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        role: "user",
      });
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const editorUser = await UserFactory.basic();
      const project = await SpaceFactory.project(workspace, editorUser.id);
      await addUserToProject(adminAuth, project, user, { asEditor: false });

      const response = await leave(workspace, project.sId);

      expect(response.status).toBe(200);
      expect((await response.json()).success).toBe(true);
    });
  });
});
