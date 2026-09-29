import { Authenticator } from "@app/lib/auth";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { MembershipUpgradeRequestResource } from "@app/lib/resources/membership_upgrade_request_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function upgradeRequestsUrl(wId: string) {
  return `/api/w/${wId}/credits/upgrade-requests`;
}

function usageConfigurationUrl(wId: string) {
  return `/api/w/${wId}/credits/usage-configuration`;
}

async function creditPricedWorkspace(): Promise<WorkspaceType> {
  return WorkspaceFactory.creditPriced({
    metronomeCustomerId: "cust_test_xxx",
  });
}

async function createMemberRequest(workspace: WorkspaceType) {
  const { user, membership } = await createPrivateApiMockRequest({
    method: "POST",
    role: "user",
    workspace,
  });
  const response = await honoApp.request(upgradeRequestsUrl(workspace.sId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return { user, membership, response };
}

async function createManagedRequests() {
  const workspace = await creditPricedWorkspace();
  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  const { user: delegate } = await createPrivateApiMockRequest({
    method: "GET",
    role: "user",
    workspace,
  });
  const member = await UserFactory.basic();
  const overlap = await UserFactory.basic();
  const outsider = await UserFactory.basic();
  for (const user of [member, overlap, outsider]) {
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const result = await MembershipUpgradeRequestResource.createPending(
      adminAuth,
      {
        user,
        reason: "Need more credits",
        reasonRequired: false,
      }
    );
    expect(result.isOk()).toBe(true);
  }
  const first = await GroupFactory.regularManual(workspace, "First");
  const second = await GroupFactory.regularManual(workspace, "Second");
  await GroupFactory.withMembers(adminAuth, first, [member, overlap]);
  await GroupFactory.withMembers(adminAuth, second, [overlap]);
  for (const group of [first, second]) {
    const grant = await GroupPermissionResource.grantToUser(adminAuth, {
      user: delegate.toJSON(),
      grantType: "group_manager",
      resourceType: "group",
      resourceId: group.id,
    });
    expect(grant.isOk()).toBe(true);
  }
  return {
    workspace,
    adminAuth,
    delegate,
    member,
    overlap,
    outsider,
    first,
    second,
  };
}

describe("/api/w/[wId]/credits/upgrade-requests", () => {
  describe("auth", () => {
    it("GET returns 403 when caller is a user", async () => {
      const workspace = await creditPricedWorkspace();
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
        workspace,
      });

      const response = await honoApp.request(upgradeRequestsUrl(workspace.sId));

      expect(response.status).toBe(403);
      expect((await response.json()).error.type).toBe("workspace_auth_error");
    });

    it("allows a manager to list and resolve requests", async () => {
      const workspace = await creditPricedWorkspace();
      const { user: member } = await createMemberRequest(workspace);

      await createPrivateApiMockRequest({
        method: "GET",
        role: "manager",
        workspace,
      });

      const listResponse = await honoApp.request(
        upgradeRequestsUrl(workspace.sId)
      );
      expect(listResponse.status).toBe(200);
      const { requests } = await listResponse.json();
      expect(requests).toHaveLength(1);
      expect(requests[0].requester.sId).toBe(member.sId);

      const patchResponse = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}/${requests[0].sId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "approved" }),
        }
      );
      expect(patchResponse.status).toBe(200);
      expect((await patchResponse.json()).request.status).toBe("approved");
    });
  });

  describe("GET (group manager)", () => {
    it("scopes requests and counts before applying a group filter", async () => {
      const { workspace, adminAuth, member, overlap, outsider, second } =
        await createManagedRequests();
      const url = upgradeRequestsUrl(workspace.sId);
      expect((await honoApp.request(url)).status).toBe(403);
      await FeatureFlagFactory.basic(adminAuth, "group_management");

      const response = await honoApp.request(url);
      expect(response.status).toBe(200);
      const { requests } = await response.json();
      expect(requests).toHaveLength(2);
      expect(
        new Set(
          requests.map((r: { requester: { sId: string } }) => r.requester.sId)
        )
      ).toEqual(new Set([member.sId, overlap.sId]));

      const filtered = await honoApp.request(`${url}?groupId=${second.sId}`);
      expect(
        (await filtered.json()).requests.map(
          (r: { requester: { sId: string } }) => r.requester.sId
        )
      ).toEqual([overlap.sId]);
      const other = await GroupFactory.regularManual(workspace, "Other");
      await GroupFactory.withMembers(adminAuth, other, [outsider]);
      const outside = await honoApp.request(`${url}?groupId=${other.sId}`);
      expect((await outside.json()).requests).toEqual([]);
      const cleared = await honoApp.request(url);
      expect((await cleared.json()).requests).toHaveLength(2);
    });

    it("returns no requests when managed members leave and never exposes another workspace", async () => {
      const { workspace, adminAuth, member, overlap, first, second } =
        await createManagedRequests();
      await FeatureFlagFactory.basic(adminAuth, "group_management");
      await first.dangerouslyRemoveMembers(adminAuth, {
        users: [member.toJSON()],
      });
      await MembershipResource.revokeMembership({ user: overlap, workspace });
      const response = await honoApp.request(upgradeRequestsUrl(workspace.sId));
      expect(response.status).toBe(200);
      expect((await response.json()).requests).toEqual([]);

      const otherWorkspace = await creditPricedWorkspace();
      await MembershipFactory.associate(otherWorkspace, member, {
        role: "user",
      });
      const otherAuth = await Authenticator.internalAdminForWorkspace(
        otherWorkspace.sId
      );
      const foreign = await MembershipUpgradeRequestResource.createPending(
        otherAuth,
        {
          user: member,
          reason: null,
          reasonRequired: false,
        }
      );
      expect(foreign.isOk()).toBe(true);
      await GroupFactory.withMembers(adminAuth, second, [member]);
      const scoped = await honoApp.request(upgradeRequestsUrl(workspace.sId));
      expect((await scoped.json()).requests).toHaveLength(1);
    });
  });

  describe("POST (member-initiated)", () => {
    it("returns 403 when workspace is not credit-priced", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

      const response = await honoApp.request(
        upgradeRequestsUrl(workspace.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );

      expect(response.status).toBe(403);
      expect((await response.json()).error.type).toBe("plan_limit_error");
    });

    it("creates a pending request for a member", async () => {
      const workspace = await creditPricedWorkspace();
      const { user, response } = await createMemberRequest(workspace);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.request.status).toBe("pending");
      expect(body.request.resolvedAt).toBeNull();
      expect(body.request.requester.sId).toBe(user.sId);
    });

    it("stores the reason when provided", async () => {
      const workspace = await creditPricedWorkspace();
      await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
        workspace,
      });

      const response = await honoApp.request(
        upgradeRequestsUrl(workspace.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: "Running a large one-off backfill this week.",
          }),
        }
      );

      expect(response.status).toBe(200);
      const { request } = await response.json();
      expect(request.reason).toBe(
        "Running a large one-off backfill this week."
      );
    });

    it("returns 400 when the workspace requires a reason and none is given", async () => {
      const workspace = await creditPricedWorkspace();

      await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
        workspace,
      });
      await honoApp.request(usageConfigurationUrl(workspace.sId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireUpgradeRequestReason: true }),
      });

      await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
        workspace,
      });
      const response = await honoApp.request(
        upgradeRequestsUrl(workspace.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error.type).toBe("invalid_request_error");
    });

    it("allows the request when the workspace requires a reason and one is given", async () => {
      const workspace = await creditPricedWorkspace();

      await createPrivateApiMockRequest({
        method: "PATCH",
        role: "admin",
        workspace,
      });
      await honoApp.request(usageConfigurationUrl(workspace.sId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireUpgradeRequestReason: true }),
      });

      await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
        workspace,
      });
      const response = await honoApp.request(
        upgradeRequestsUrl(workspace.sId),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Need more credits for a demo." }),
        }
      );

      expect(response.status).toBe(200);
      const { request } = await response.json();
      expect(request.reason).toBe("Need more credits for a demo.");
    });

    it("is idempotent — a second request reuses the pending one", async () => {
      const workspace = await creditPricedWorkspace();
      const { membership, response: first } =
        await createMemberRequest(workspace);
      const firstId = (await first.json()).request.sId;

      // Same authenticated member requests again.
      await membership.updateCreditState("on_pool");
      const second = await honoApp.request(upgradeRequestsUrl(workspace.sId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(second.status).toBe(200);
      expect((await second.json()).request.sId).toBe(firstId);
    });

    it("reuses the pending request on retry once the reason requirement is enabled after creation", async () => {
      const workspace = await creditPricedWorkspace();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const configResult = await CreditUsageConfigurationResource.makeNew(
        adminAuth,
        {
          allowMemberUpgradeRequests: true,
          upgradeRequestEmailEnabled: false,
          requireUpgradeRequestReason: false,
          defaultDiscountPercent: 0,
          usageCapCredits: null,
        }
      );
      if (configResult.isErr()) {
        throw configResult.error;
      }
      const config = configResult.value;

      const { response: first } = await createMemberRequest(workspace);
      const firstId = (await first.json()).request.sId;

      // Simulate the workspace toggling the reason requirement on after the
      // first request already succeeded.
      await config.updateConfiguration(adminAuth, {
        requireUpgradeRequestReason: true,
      });

      // Same authenticated member retries with no reason (e.g. a network
      // retry from an older client); it must reuse the existing pending
      // request rather than being rejected.
      const retry = await honoApp.request(upgradeRequestsUrl(workspace.sId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(retry.status).toBe(200);
      expect((await retry.json()).request.sId).toBe(firstId);
    });
  });

  describe("GET + PATCH (admin)", () => {
    it("lists pending requests and resolves them", async () => {
      const workspace = await creditPricedWorkspace();
      const { user: member } = await createMemberRequest(workspace);

      // Re-authenticate as an admin of the same workspace.
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });

      const listResponse = await honoApp.request(
        upgradeRequestsUrl(workspace.sId)
      );
      expect(listResponse.status).toBe(200);
      const { requests } = await listResponse.json();
      expect(requests).toHaveLength(1);
      expect(requests[0].requester.sId).toBe(member.sId);

      const requestId = requests[0].sId;
      const patchResponse = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "approved" }),
        }
      );
      expect(patchResponse.status).toBe(200);
      expect((await patchResponse.json()).request.status).toBe("approved");

      // The resolved request no longer appears in the pending list.
      const afterResponse = await honoApp.request(
        upgradeRequestsUrl(workspace.sId)
      );
      expect((await afterResponse.json()).requests).toHaveLength(0);
    });

    it("PATCH returns 404 for an unknown request id", async () => {
      const workspace = await creditPricedWorkspace();
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });

      const response = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}/mur_nonexistent`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "denied" }),
        }
      );

      expect(response.status).toBe(404);
    });

    it("PATCH returns 403 when caller is a user", async () => {
      const workspace = await creditPricedWorkspace();
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
        workspace,
      });

      const response = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}/mur_whatever`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "denied" }),
        }
      );

      expect(response.status).toBe(403);
    });
  });
});
