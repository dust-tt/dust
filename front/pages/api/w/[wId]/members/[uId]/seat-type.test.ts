import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

import handler from "./seat-type";

describe("PATCH /api/w/[wId]/members/[uId]/seat-type", () => {
  describe("auth", () => {
    it("returns 403 when caller is not an admin", async () => {
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "user",
      });

      req.query.uId = user.sId;
      req.body = { seatType: "pro" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().error.type).toBe("workspace_auth_error");
    });

    it("returns 403 when workspace is not on Metronome billing", async () => {
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
      });

      req.query.uId = user.sId;
      req.body = { seatType: "pro" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().error.type).toBe("plan_limit_error");
    });
  });

  describe("method validation", () => {
    it("returns 405 for unsupported methods", async () => {
      const workspace = await WorkspaceFactory.metronome();
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
        workspace,
      });

      req.query.uId = user.sId;
      req.body = { seatType: "pro" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData().error.type).toBe("method_not_supported_error");
    });
  });

  describe("input validation", () => {
    it("returns 400 when uId is missing", async () => {
      const workspace = await WorkspaceFactory.metronome();
      const { req, res } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
        workspace,
      });

      req.body = { seatType: "pro" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });

    it("returns 404 when uId does not exist", async () => {
      const workspace = await WorkspaceFactory.metronome();
      const { req, res } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
        workspace,
      });

      req.query.uId = "nonexistent-user-id";
      req.body = { seatType: "pro" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData().error.type).toBe("workspace_user_not_found");
    });

    it("returns 400 for an invalid seatType", async () => {
      const workspace = await WorkspaceFactory.metronome();
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
        workspace,
      });

      req.query.uId = user.sId;
      req.body = { seatType: "invalid_type" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });
  });

  describe("seat type update", () => {
    it("returns 200 and updated seatType when admin upgrades another member to pro", async () => {
      const workspace = await WorkspaceFactory.metronome();
      const { req, res } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
        workspace,
      });

      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      req.query.uId = targetUser.sId;
      req.body = { seatType: "pro" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().seatType).toBe("pro");
    });

    it("returns 200 when admin upgrades their own seat to max", async () => {
      const workspace = await WorkspaceFactory.metronome();
      const { req, res, user } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
        workspace,
      });

      req.query.uId = user.sId;
      req.body = { seatType: "max" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().seatType).toBe("max");
    });

    it("returns 200 when downgrading from max to pro", async () => {
      const workspace = await WorkspaceFactory.metronome();
      const {
        req,
        res,
        workspace: w,
      } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
        workspace,
      });

      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(w, targetUser, {
        role: "user",
      });

      req.query.uId = targetUser.sId;
      req.body = { seatType: "pro" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().seatType).toBe("pro");
    });
  });
});
