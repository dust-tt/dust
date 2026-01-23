import { describe, expect, it, vi } from "vitest";

import { launchIndexUserSearchWorkflow } from "@app/temporal/es_indexation/client";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";

import handler from "./index";

describe("POST /api/w/[wId]/members/[uId]", () => {
  describe("sole admin protection", () => {
    it("should return 400 when sole admin tries to change own role to user", async () => {
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      // Set the user ID in the query to match the authenticated user (self-modification)
      req.query.uId = user.sId;
      req.body = { role: "user" }; // Trying to change from admin to user

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = res._getJSONData();
      expect(data.error.type).toBe("invalid_request_error");
      expect(data.error.message).toBe(
        "Cannot change your role as you are the sole admin of this workspace."
      );
    });

    it("should return 400 when sole admin tries to change own role to builder", async () => {
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      req.query.uId = user.sId;
      req.body = { role: "builder" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = res._getJSONData();
      expect(data.error.type).toBe("invalid_request_error");
      expect(data.error.message).toBe(
        "Cannot change your role as you are the sole admin of this workspace."
      );
    });

    it("should return 200 when sole admin keeps their admin role", async () => {
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      req.query.uId = user.sId;
      req.body = { role: "admin" }; // Staying as admin

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.member).toBeDefined();
      expect(data.member.workspaces[0].role).toBe("admin");
    });

    it("should return 200 when admin changes role with multiple admins present", async () => {
      const { req, res, workspace, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      // Create another admin so current user is not sole admin
      const anotherAdmin = await UserFactory.basic();
      await MembershipFactory.associate(workspace, anotherAdmin, {
        role: "admin",
      });

      req.query.uId = user.sId;
      req.body = { role: "user" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.member).toBeDefined();
      expect(data.member.workspaces[0].role).toBe("user");
    });

    it("should return 200 when admin changes non-admin user's role", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      // Create a user with user role
      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      req.query.uId = targetUser.sId;
      req.body = { role: "builder" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.member).toBeDefined();
      expect(data.member.workspaces[0].role).toBe("builder");
    });

    it("should return 403 when non-admin user tries to change own role", async () => {
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      req.query.uId = user.sId;
      req.body = { role: "admin" };

      await handler(req, res);

      // Should fail with 403 due to insufficient permissions, not sole admin protection
      expect(res._getStatusCode()).toBe(403);
      const data = res._getJSONData();
      expect(data.error.type).toBe("workspace_auth_error");
    });
  });

  describe("existing role management functionality", () => {
    it("should return 403 when user is not admin", async () => {
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      req.query.uId = user.sId;
      req.body = { role: "builder" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      const data = res._getJSONData();
      expect(data.error.type).toBe("workspace_auth_error");
    });

    it("should return 400 for invalid role parameter", async () => {
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      req.query.uId = user.sId;
      req.body = { role: "invalid_role" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = res._getJSONData();
      expect(data.error.type).toBe("invalid_request_error");
    });

    it("should return 404 when user is not found", async () => {
      const { req, res } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      req.query.uId = "nonexistent-user-id";
      req.body = { role: "user" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      const data = res._getJSONData();
      expect(data.error.type).toBe("workspace_user_not_found");
    });

    it("should return 400 for missing uId parameter", async () => {
      const { req, res } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      // Missing uId parameter
      req.body = { role: "user" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = res._getJSONData();
      expect(data.error.type).toBe("invalid_request_error");
      expect(data.error.message).toContain("uId");
    });
  });

  describe("method validation", () => {
    it("should return 405 for unsupported methods", async () => {
      const methods = ["PUT", "DELETE", "PATCH"] as const;

      for (const method of methods) {
        const { req, res, user } = await createPrivateApiMockRequest({
          method,
          role: "admin",
        });

        req.query.uId = user.sId;

        await handler(req, res);

        expect(res._getStatusCode()).toBe(405);
        const data = res._getJSONData();
        expect(data.error.type).toBe("method_not_supported_error");
      }
    });
  });

  describe("GET /api/w/[wId]/members/[uId]", () => {
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
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      req.query.uId = user.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.member).toBeDefined();

      // data.member should only contain allowed attributes
      expect(allowedAttributes).toStrictEqual(
        new Set(Object.keys(data.member))
      );
      expect(data.member.id).toBe(user.sId);
      expect(data.member.role).toBe("admin");
    });

    it("should return 200 when user requests own data", async () => {
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      req.query.uId = user.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      // data.member should only contain allowed attributes
      expect(allowedAttributes).toStrictEqual(
        new Set(Object.keys(data.member))
      );
      expect(data.member.id).toBe(user.sId);
      expect(data.member.role).toBe("user");
    });

    it("should return 200 when admin requests another user's data", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "builder",
      });

      req.query.uId = targetUser.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      // data.member should only contain allowed attributes
      expect(allowedAttributes).toStrictEqual(
        new Set(Object.keys(data.member))
      );
      expect(data.member.id).toBe(targetUser.sId);
      expect(data.member.role).toBe("builder");
    });

    it("should return 200 when non-admin user requests another user's data", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      req.query.uId = targetUser.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      // data.member should only contain allowed attributes
      expect(allowedAttributes).toStrictEqual(
        new Set(Object.keys(data.member))
      );
      expect(data.member.id).toBe(targetUser.sId);
    });

    it("should return 404 when user is not found", async () => {
      const { req, res } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      req.query.uId = "nonexistent-user-id";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      const data = res._getJSONData();
      expect(data.error.type).toBe("workspace_user_not_found");
    });
  });

  describe("user search indexation", () => {
    it("should call launchIndexUserSearchWorkflow when role is updated", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      // Create a user with user role
      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      // Clear any previous calls from user creation
      const mockIndexWorkflow = vi.mocked(launchIndexUserSearchWorkflow);
      mockIndexWorkflow.mockClear();

      req.query.uId = targetUser.sId;
      req.body = { role: "builder" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);

      // Verify indexation was called with the correct userId
      expect(mockIndexWorkflow).toHaveBeenCalledWith({
        userId: targetUser.sId,
      });
      expect(mockIndexWorkflow).toHaveBeenCalledTimes(1);
    });

    it("should call launchIndexUserSearchWorkflow when membership is revoked", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      // Create a user with user role
      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      // Clear any previous calls from user creation
      const mockIndexWorkflow = vi.mocked(launchIndexUserSearchWorkflow);
      mockIndexWorkflow.mockClear();

      req.query.uId = targetUser.sId;
      req.body = { role: "revoked" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);

      // Verify indexation was called with the correct userId
      expect(mockIndexWorkflow).toHaveBeenCalledWith({
        userId: targetUser.sId,
      });
      expect(mockIndexWorkflow).toHaveBeenCalledTimes(1);
    });

    it("should call launchIndexUserSearchWorkflow when admin changes own role with multiple admins", async () => {
      const { req, res, workspace, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      // Create another admin so current user is not sole admin
      const anotherAdmin = await UserFactory.basic();
      await MembershipFactory.associate(workspace, anotherAdmin, {
        role: "admin",
      });

      // Clear any previous calls from user creation
      const mockIndexWorkflow = vi.mocked(launchIndexUserSearchWorkflow);
      mockIndexWorkflow.mockClear();

      req.query.uId = user.sId;
      req.body = { role: "user" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);

      // Verify indexation was called with the correct userId
      expect(mockIndexWorkflow).toHaveBeenCalledWith({
        userId: user.sId,
      });
      expect(mockIndexWorkflow).toHaveBeenCalledTimes(1);
    });
  });
});
