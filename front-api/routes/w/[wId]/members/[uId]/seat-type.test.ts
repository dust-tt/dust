import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function seatTypeUrl(wId: string, uId: string) {
  return `/api/w/${wId}/members/${uId}/seat-type`;
}

describe("PATCH /api/w/:wId/members/:uId/seat-type", () => {
  describe("auth", () => {
    it("returns 403 when caller is not an admin", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "user",
      });

      const response = await honoApp.request(
        seatTypeUrl(workspace.sId, user.sId),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seatType: "pro" }),
        }
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error.type).toBe("workspace_auth_error");
    });

    it("returns 403 when workspace is not on Metronome billing", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
      });

      const response = await honoApp.request(
        seatTypeUrl(workspace.sId, user.sId),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seatType: "pro" }),
        }
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error.type).toBe("plan_limit_error");
    });
  });

  describe("input validation", () => {
    it("returns 404 when uId does not exist", async () => {
      const workspace = await WorkspaceFactory.metronome();
      await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        seatTypeUrl(workspace.sId, "nonexistent-user-id"),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seatType: "pro" }),
        }
      );

      expect(response.status).toBe(404);
      expect((await response.json()).error.type).toBe(
        "workspace_user_not_found"
      );
    });

    it("returns 400 for an invalid seatType", async () => {
      const workspace = await WorkspaceFactory.metronome();
      const { user } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        seatTypeUrl(workspace.sId, user.sId),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seatType: "invalid_type" }),
        }
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error.type).toBe("invalid_request_error");
    });
  });

  describe("seat type update", () => {
    it("returns 200 and updated seatType when admin upgrades another member to pro", async () => {
      const workspace = await WorkspaceFactory.metronome();
      await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
        workspace,
      });

      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      const response = await honoApp.request(
        seatTypeUrl(workspace.sId, targetUser.sId),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seatType: "pro" }),
        }
      );

      expect(response.status).toBe(200);
      expect((await response.json()).seatType).toBe("pro");
    });

    it("returns 200 when admin upgrades their own seat to max", async () => {
      const workspace = await WorkspaceFactory.metronome();
      const { user } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        seatTypeUrl(workspace.sId, user.sId),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seatType: "max" }),
        }
      );

      expect(response.status).toBe(200);
      expect((await response.json()).seatType).toBe("max");
    });

    it("returns 400 when assigning a paid seat while on a free plan", async () => {
      const workspace = await WorkspaceFactory.creditPricedFree();
      await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
        workspace,
      });

      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
        seatType: "none",
      });

      const response = await honoApp.request(
        seatTypeUrl(workspace.sId, targetUser.sId),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seatType: "pro" }),
        }
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error.type).toBe("invalid_request_error");
    });

    it("returns 200 when downgrading from max to pro", async () => {
      const workspace = await WorkspaceFactory.metronome();
      const { workspace: w } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
        workspace,
      });

      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(w, targetUser, {
        role: "user",
      });

      const response = await honoApp.request(
        seatTypeUrl(w.sId, targetUser.sId),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seatType: "pro" }),
        }
      );

      expect(response.status).toBe(200);
      expect((await response.json()).seatType).toBe("pro");
    });
  });
});
