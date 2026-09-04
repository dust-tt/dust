import { MembershipResource } from "@app/lib/resources/membership_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

const TEST_METRONOME_CUSTOMER_ID = "cust_test_xxx";

async function makeMetronomeWorkspaceWithCustomer(): Promise<WorkspaceType> {
  return WorkspaceFactory.metronome({
    metronomeCustomerId: TEST_METRONOME_CUSTOMER_ID,
  });
}

function spendLimitUrl(wId: string, uId: string) {
  return `/api/w/${wId}/members/${uId}/spend_limit`;
}

describe("/api/w/[wId]/members/[uId]/spend_limit", () => {
  describe("auth", () => {
    it("returns 403 when caller is a user", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, user.sId)
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error.type).toBe("workspace_auth_error");
    });

    it("allows a manager to read and set the spend limit", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      await createPrivateApiMockRequest({
        method: "PUT",
        role: "manager",
        workspace,
      });

      const putResponse = await honoApp.request(
        spendLimitUrl(workspace.sId, targetUser.sId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "limited", awuCredits: 1500 }),
        }
      );
      expect(putResponse.status).toBe(200);
      expect(await putResponse.json()).toEqual({
        limit: { kind: "limited", awuCredits: 1500 },
      });

      const getResponse = await honoApp.request(
        spendLimitUrl(workspace.sId, targetUser.sId)
      );
      expect(getResponse.status).toBe(200);
      expect(await getResponse.json()).toEqual({
        kind: "limited",
        awuCredits: 1500,
      });
    });

    it("returns 403 when workspace is not on Metronome billing", async () => {
      const { workspace, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, user.sId)
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error.type).toBe("plan_limit_error");
    });
  });

  describe("method validation", () => {
    it("returns 404 for unsupported methods", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { user } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, user.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("input validation", () => {
    it("returns 404 when uId does not exist", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, "nonexistent-user-id")
      );

      expect(response.status).toBe(404);
      expect((await response.json()).error.type).toBe(
        "workspace_user_not_found"
      );
    });

    it("returns 400 on PUT with negative awuCredits", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { user } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, user.sId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "limited", awuCredits: -1 }),
        }
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error.type).toBe("invalid_request_error");
    });

    it("returns 400 on PUT with non-integer awuCredits", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { user } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, user.sId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "limited", awuCredits: 1.5 }),
        }
      );

      expect(response.status).toBe(400);
    });

    it("returns 400 on PUT with awuCredits above max", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { user } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, user.sId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "limited", awuCredits: 100_000_000 }),
        }
      );

      expect(response.status).toBe(400);
    });
  });

  describe("GET", () => {
    it("returns unlimited when no override is persisted", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, user.sId)
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ kind: "unlimited" });
    });

    it("returns limited with the override persisted on the membership", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const targetUser = await UserFactory.basic();
      const membership = await MembershipFactory.associate(
        workspace,
        targetUser,
        { role: "user" }
      );
      await membership.updatePoolCapOverride({
        poolCapOverrideAwuCredits: 2500,
      });

      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, targetUser.sId)
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        kind: "limited",
        awuCredits: 2500,
      });
    });
  });

  describe("PUT", () => {
    it("clears the override for unlimited", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const targetUser = await UserFactory.basic();
      const membership = await MembershipFactory.associate(
        workspace,
        targetUser,
        { role: "user" }
      );
      await membership.updatePoolCapOverride({
        poolCapOverrideAwuCredits: 1200,
      });

      await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, targetUser.sId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "unlimited" }),
        }
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ limit: { kind: "unlimited" } });

      // The persisted override is cleared.
      const updatedMembership =
        await MembershipResource.getActiveMembershipOfUserInWorkspace({
          user: targetUser,
          workspace,
        });
      expect(updatedMembership?.poolCapOverrideAwuCredits).toBeNull();
    });

    it("persists the override for limited", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const targetUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, targetUser, {
        role: "user",
      });

      await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        spendLimitUrl(workspace.sId, targetUser.sId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "limited", awuCredits: 1500 }),
        }
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        limit: { kind: "limited", awuCredits: 1500 },
      });

      // The pool-only override is persisted on the membership.
      const updatedMembership =
        await MembershipResource.getActiveMembershipOfUserInWorkspace({
          user: targetUser,
          workspace,
        });
      expect(updatedMembership?.poolCapOverrideAwuCredits).toBe(1500);
    });
  });
});
