import { launchIndexUserSearchWorkflow } from "@app/temporal/es_indexation/client";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

function memberUrl(wId: string, uId: string) {
  return `/api/w/${wId}/members/${uId}`;
}

describe("POST /api/w/:wId/members/:uId", () => {
  describe("sole admin protection", () => {
    it("should return 400 when sole admin tries to change own role to user", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, user.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "user" }),
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.type).toBe("invalid_request_error");
      expect(data.error.message).toBe(
        "Cannot change your role as you are the sole admin of this workspace."
      );
    });

    it("should return 400 when sole admin tries to change own role to builder", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, user.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "builder" }),
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.type).toBe("invalid_request_error");
      expect(data.error.message).toBe(
        "Cannot change your role as you are the sole admin of this workspace."
      );
    });

    it("should return 200 when sole admin keeps their admin role", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, user.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "admin" }),
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.member).toBeDefined();
      expect(data.member.workspaces[0].role).toBe("admin");
    });

    it("should return 200 when admin changes role with multiple admins present", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      const anotherAdmin = await UserFactory.basic();
      await MembershipFactory.associate(workspace, anotherAdmin, {
        role: "admin",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, user.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "user" }),
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.member).toBeDefined();
      expect(data.member.workspaces[0].role).toBe("user");
    });

    it("should return 200 when admin changes non-admin user's role", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, targetUser.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "builder" }),
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.member).toBeDefined();
      expect(data.member.workspaces[0].role).toBe("builder");
    });

    it("should return 400 when sole admin tries to revoke themselves", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, user.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "revoked" }),
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.type).toBe("invalid_request_error");
      expect(data.error.message).toBe(
        "Cannot revoke the last admin of a workspace."
      );
    });

    it("should return 200 when sole admin revokes a non-admin user", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      const regularUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, regularUser, {
        role: "user",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, regularUser.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "revoked" }),
        }
      );

      expect(response.status).toBe(200);
    });

    it("should return 200 when revoking an admin with multiple admins present", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      const otherAdmin = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherAdmin, {
        role: "admin",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, otherAdmin.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "revoked" }),
        }
      );

      expect(response.status).toBe(200);
    });

    it("should return 403 when non-admin user tries to change own role", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, user.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "admin" }),
        }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error.type).toBe("workspace_auth_error");
    });
  });

  describe("existing role management functionality", () => {
    it("should return 403 when user is not admin", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, user.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "builder" }),
        }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error.type).toBe("workspace_auth_error");
    });

    it("should return 400 for invalid role parameter", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, user.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "invalid_role" }),
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error.type).toBe("invalid_request_error");
    });

    it("should return 404 when user is not found", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, "nonexistent-user-id"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "user" }),
        }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error.type).toBe("workspace_user_not_found");
    });
  });

  describe("business admin escalation guard", () => {
    it("should return 403 when business admin tries to change an admin's role", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "business_admin",
      });

      const targetAdmin = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetAdmin, {
        role: "admin",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, targetAdmin.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "user" }),
        }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error.type).toBe("workspace_auth_error");
      expect(data.error.message).toBe(
        "You do not have permission to assign or modify the admin role."
      );
    });

    it("should return 403 when business admin tries to promote a user to admin", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "business_admin",
      });

      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, targetUser.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "admin" }),
        }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error.type).toBe("workspace_auth_error");
      expect(data.error.message).toBe(
        "You do not have permission to assign or modify the admin role."
      );
    });

    it("should return 403 when business admin tries to revoke an admin", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "business_admin",
      });

      const targetAdmin = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetAdmin, {
        role: "admin",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, targetAdmin.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "revoked" }),
        }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error.type).toBe("workspace_auth_error");
      expect(data.error.message).toBe(
        "You do not have permission to assign or modify the admin role."
      );
    });

    it("should return 200 when business admin changes a non-admin user's role", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "business_admin",
      });

      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, targetUser.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "builder" }),
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.member).toBeDefined();
      expect(data.member.workspaces[0].role).toBe("builder");
    });
  });

  describe("GET /api/w/:wId/members/:uId", () => {
    const allowedAttributes = new Set([
      "id",
      "username",
      "email",
      "firstName",
      "lastName",
      "fullName",
      "image",
      "revoked",
      "role",
      "startAt",
      "endAt",
    ]);

    it("should return 200 when admin requests own data", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, user.sId)
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.member).toBeDefined();
      expect(allowedAttributes).toStrictEqual(
        new Set(Object.keys(data.member))
      );
      expect(data.member.id).toBe(user.sId);
      expect(data.member.role).toBe("admin");
    });

    it("should return 200 when user requests own data", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, user.sId)
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(allowedAttributes).toStrictEqual(
        new Set(Object.keys(data.member))
      );
      expect(data.member.id).toBe(user.sId);
      expect(data.member.role).toBe("user");
    });

    it("should return 200 when admin requests another user's data", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "builder",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, targetUser.sId)
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(allowedAttributes).toStrictEqual(
        new Set(Object.keys(data.member))
      );
      expect(data.member.id).toBe(targetUser.sId);
      expect(data.member.role).toBe("builder");
    });

    it("should return 200 when non-admin user requests another user's data", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, targetUser.sId)
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(allowedAttributes).toStrictEqual(
        new Set(Object.keys(data.member))
      );
      expect(data.member.id).toBe(targetUser.sId);
    });

    it("should return 404 when user is not found", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      const response = await honoApp.request(
        memberUrl(workspace.sId, "nonexistent-user-id")
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error.type).toBe("workspace_user_not_found");
    });
  });

  describe("user search indexation", () => {
    it("should call launchIndexUserSearchWorkflow when role is updated", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      const mockIndexWorkflow = vi.mocked(launchIndexUserSearchWorkflow);
      mockIndexWorkflow.mockClear();

      const response = await honoApp.request(
        memberUrl(workspace.sId, targetUser.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "builder" }),
        }
      );

      expect(response.status).toBe(200);
      expect(mockIndexWorkflow).toHaveBeenCalledWith({
        userId: targetUser.sId,
      });
      expect(mockIndexWorkflow).toHaveBeenCalledTimes(1);
    });

    it("should call launchIndexUserSearchWorkflow when membership is revoked", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      const mockIndexWorkflow = vi.mocked(launchIndexUserSearchWorkflow);
      mockIndexWorkflow.mockClear();

      const response = await honoApp.request(
        memberUrl(workspace.sId, targetUser.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "revoked" }),
        }
      );

      expect(response.status).toBe(200);
      expect(mockIndexWorkflow).toHaveBeenCalledWith({
        userId: targetUser.sId,
      });
      expect(mockIndexWorkflow).toHaveBeenCalledTimes(1);
    });

    it("should call launchIndexUserSearchWorkflow when admin changes own role with multiple admins", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      const anotherAdmin = await UserFactory.basic();
      await MembershipFactory.associate(workspace, anotherAdmin, {
        role: "admin",
      });

      const mockIndexWorkflow = vi.mocked(launchIndexUserSearchWorkflow);
      mockIndexWorkflow.mockClear();

      const response = await honoApp.request(
        memberUrl(workspace.sId, user.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "user" }),
        }
      );

      expect(response.status).toBe(200);
      expect(mockIndexWorkflow).toHaveBeenCalledWith({
        userId: user.sId,
      });
      expect(mockIndexWorkflow).toHaveBeenCalledTimes(1);
    });
  });
});
