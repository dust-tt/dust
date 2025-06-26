import { describe, expect } from "vitest";

import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./index";

describe("POST /api/w/[wId]/members/[uId]", () => {
  describe("sole admin protection", () => {
    itInTransaction(
      "should return 400 when sole admin tries to change own role to user",
      async () => {
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
      }
    );

    itInTransaction(
      "should return 400 when sole admin tries to change own role to builder",
      async () => {
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
      }
    );

    itInTransaction(
      "should return 200 when sole admin keeps their admin role",
      async () => {
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
      }
    );

    itInTransaction(
      "should return 200 when admin changes role with multiple admins present",
      async () => {
        const { req, res, workspace, user } = await createPrivateApiMockRequest(
          {
            method: "POST",
            role: "admin",
          }
        );

        // Create another admin so current user is not sole admin
        const anotherAdmin = await UserFactory.basic();
        await MembershipFactory.associate(workspace, anotherAdmin, "admin");

        req.query.uId = user.sId;
        req.body = { role: "user" };

        await handler(req, res);

        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(data.member).toBeDefined();
        expect(data.member.workspaces[0].role).toBe("user");
      }
    );

    itInTransaction(
      "should return 200 when admin changes non-admin user's role",
      async () => {
        const { req, res, workspace } = await createPrivateApiMockRequest({
          method: "POST",
          role: "admin",
        });

        // Create a user with user role
        const targetUser = await UserFactory.basic();
        await MembershipFactory.associate(workspace, targetUser, "user");

        req.query.uId = targetUser.sId;
        req.body = { role: "builder" };

        await handler(req, res);

        expect(res._getStatusCode()).toBe(200);
        const data = res._getJSONData();
        expect(data.member).toBeDefined();
        expect(data.member.workspaces[0].role).toBe("builder");
      }
    );

    itInTransaction(
      "should return 403 when non-admin user tries to change own role",
      async () => {
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
      }
    );
  });

  describe("existing role management functionality", () => {
    itInTransaction("should return 403 when user is not admin", async () => {
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

    itInTransaction(
      "should return 400 for invalid role parameter",
      async () => {
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
      }
    );

    itInTransaction("should return 404 when user is not found", async () => {
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

    itInTransaction("should return 400 for missing uId parameter", async () => {
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
    itInTransaction("should return 405 for non-POST methods", async () => {
      const methods = ["GET", "PUT", "DELETE", "PATCH"] as const;

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
});
