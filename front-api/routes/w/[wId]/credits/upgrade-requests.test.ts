import * as spendLimits from "@app/lib/metronome/alerts/spend_limits";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { MembershipUpgradeRequestResource } from "@app/lib/resources/membership_upgrade_request_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/user_search/search"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    searchAllUsers: vi.fn(
      async ({
        owner,
        searchTerm,
      }: {
        owner: WorkspaceType;
        searchTerm: string;
      }) => {
        const { memberships } =
          await MembershipResource.getMembershipsForWorkspace({
            workspace: owner,
            includeUser: true,
          });

        const users = memberships
          .map((m) => m.user)
          .filter((u): u is NonNullable<typeof u> => u !== undefined);

        const lowerSearchTerm = searchTerm.toLowerCase();
        const filteredUsers = searchTerm.trim()
          ? users.filter((user) => {
              const email = user.email?.toLowerCase() || "";
              const fullName =
                `${user.firstName ?? ""} ${user.lastName ?? ""}`.toLowerCase();
              return (
                email.includes(lowerSearchTerm) ||
                fullName.includes(lowerSearchTerm)
              );
            })
          : users;

        return new Ok({
          users: filteredUsers.map((user) => ({
            workspace_id: owner.sId,
            user_id: user.sId,
            email: user.email,
            full_name: `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(),
            updated_at: user.updatedAt,
          })),
          total: filteredUsers.length,
        });
      }
    ),
  };
});

import { honoApp } from "@front-api/app";

vi.mock("@app/lib/metronome/alerts/spend_limits", async () => {
  const actual = await vi.importActual<typeof spendLimits>(
    "@app/lib/metronome/alerts/spend_limits"
  );
  return {
    ...actual,
    upsertMetronomePerUserCapAlert: vi.fn(),
    clearMetronomePerUserCapAlert: vi.fn(),
    upsertMetronomePerUserWarningAlert: vi.fn(),
    clearMetronomePerUserWarningAlert: vi.fn(),
  };
});

beforeEach(() => {
  vi.mocked(spendLimits.upsertMetronomePerUserCapAlert).mockResolvedValue(
    new Ok({ alertId: "alert_test_xxx" })
  );
  vi.mocked(spendLimits.clearMetronomePerUserCapAlert).mockResolvedValue(
    new Ok(undefined)
  );
  vi.mocked(spendLimits.upsertMetronomePerUserWarningAlert).mockResolvedValue(
    new Ok(null)
  );
  vi.mocked(spendLimits.clearMetronomePerUserWarningAlert).mockResolvedValue(
    new Ok(undefined)
  );
});

function upgradeRequestsUrl(wId: string) {
  return `/api/w/${wId}/credits/upgrade-requests`;
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

    it("is idempotent — a second request reuses the pending one", async () => {
      const workspace = await creditPricedWorkspace();
      const { membership, response: first } =
        await createMemberRequest(workspace);
      const firstSId = (await first.json()).request.sId;

      // Same authenticated member requests again.
      await membership.updateCreditState("capped");
      const second = await honoApp.request(upgradeRequestsUrl(workspace.sId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(second.status).toBe(200);
      expect((await second.json()).request.sId).toBe(firstSId);
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

  describe("GET ?status=resolved (history)", () => {
    it("only lists resolved requests, most recently resolved first", async () => {
      const workspace = await creditPricedWorkspace();
      const { user: member } = await createMemberRequest(workspace);

      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });
      const { sId: requestId } = (
        await (await honoApp.request(upgradeRequestsUrl(workspace.sId))).json()
      ).requests[0];

      const resolvedListBeforeResolve = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}?status=resolved`
      );
      expect((await resolvedListBeforeResolve.json()).requests).toHaveLength(0);

      await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "denied" }),
        }
      );

      const resolvedListResponse = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}?status=resolved`
      );
      expect(resolvedListResponse.status).toBe(200);
      const { requests: resolvedRequests } = await resolvedListResponse.json();
      expect(resolvedRequests).toHaveLength(1);
      expect(resolvedRequests[0].sId).toBe(requestId);
      expect(resolvedRequests[0].status).toBe("denied");
      expect(resolvedRequests[0].requester.sId).toBe(member.sId);

      // Still absent from the pending list.
      const pendingListResponse = await honoApp.request(
        upgradeRequestsUrl(workspace.sId)
      );
      expect((await pendingListResponse.json()).requests).toHaveLength(0);
    });

    it("PATCH with grantedSeatType snapshots the seat upgrade for history", async () => {
      const workspace = await creditPricedWorkspace();
      await createMemberRequest(workspace);

      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });
      const { sId: requestId } = (
        await (await honoApp.request(upgradeRequestsUrl(workspace.sId))).json()
      ).requests[0];

      const patchResponse = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "approved",
            grantedSeatType: "max",
          }),
        }
      );
      expect(patchResponse.status).toBe(200);

      const resolvedListResponse = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}?status=resolved`
      );
      const { requests } = await resolvedListResponse.json();
      expect(requests[0].grantedSeatType).toBe("max");
      expect(requests[0].grantedAwuCredits).toBeNull();
      expect(requests[0].grantedUnlimitedSpend).toBe(false);
    });

    it("PATCH approves the request through the seat-approval flow (seat-type update then resolve)", async () => {
      const workspace = await creditPricedWorkspace();
      const { user: member } = await createMemberRequest(workspace);

      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });
      const { sId: requestId } = (
        await (await honoApp.request(upgradeRequestsUrl(workspace.sId))).json()
      ).requests[0];

      // Mirrors the UI flow: the seat-type mutation is a separate call from
      // the resolution, exactly as `ChangeSeatModal` does before resolving.
      const seatTypeResponse = await honoApp.request(
        `/api/w/${workspace.sId}/members/${member.sId}/seat-type`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seatType: "max" }),
        }
      );
      expect(seatTypeResponse.status).toBe(200);

      const patchResponse = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "approved",
            grantedSeatType: "max",
          }),
        }
      );
      expect(patchResponse.status).toBe(200);

      const resolvedListResponse = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}?status=resolved`
      );
      const { requests } = await resolvedListResponse.json();
      expect(requests[0].status).toBe("approved");
      expect(requests[0].grantedSeatType).toBe("max");
    });

    it("only one of two concurrent approvals succeeds, and the surviving grant matches the winner", async () => {
      const workspace = await creditPricedWorkspace();
      await createMemberRequest(workspace);

      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });
      const { sId: requestId } = (
        await (await honoApp.request(upgradeRequestsUrl(workspace.sId))).json()
      ).requests[0];

      const resolveUrl = `${upgradeRequestsUrl(workspace.sId)}/${requestId}`;
      const [approveResponse, denyResponse] = await Promise.all([
        honoApp.request(resolveUrl, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "approved",
            limit: { kind: "unlimited" },
          }),
        }),
        honoApp.request(resolveUrl, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "denied" }),
        }),
      ]);

      // Exactly one of the two concurrent resolutions wins; the other gets a
      // 409 rather than silently overwriting the winner's resolution.
      const statuses = [approveResponse.status, denyResponse.status].sort();
      expect(statuses).toEqual([200, 409]);

      const resolvedListResponse = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}?status=resolved`
      );
      const { requests } = await resolvedListResponse.json();
      expect(requests).toHaveLength(1);
      const resolved = requests[0];

      // The persisted status and the persisted grant must agree on which
      // admin's resolution actually won — never a split-brain where one
      // admin's status "wins" while the other admin's side effect lingers.
      if (resolved.status === "approved") {
        expect(approveResponse.status).toBe(200);
        expect(resolved.grantedUnlimitedSpend).toBe(true);
      } else {
        expect(resolved.status).toBe("denied");
        expect(denyResponse.status).toBe(200);
        expect(resolved.grantedUnlimitedSpend).toBe(false);
        expect(resolved.grantedAwuCredits).toBeNull();
      }
    });

    it("paginates resolved requests 100 per page", async () => {
      const workspace = await creditPricedWorkspace();
      const { user: member, auth: memberAuth } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "user",
          workspace,
        });

      const totalResolvedRequests = 101;
      for (let i = 0; i < totalResolvedRequests; i++) {
        const created = await MembershipUpgradeRequestResource.createPending(
          memberAuth,
          { user: member, reason: null }
        );
        if (created.isErr()) {
          throw created.error;
        }
        await created.value.markAsResolved(memberAuth, {
          status: i % 2 === 0 ? "approved" : "denied",
          resolvedByUser: member,
        });
      }

      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });

      const firstPageResponse = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}?status=resolved`
      );
      expect(firstPageResponse.status).toBe(200);
      const firstPage = await firstPageResponse.json();
      expect(firstPage.requests).toHaveLength(100);
      expect(firstPage.total).toBe(totalResolvedRequests);

      const secondPageResponse = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}?status=resolved&offset=100`
      );
      expect(secondPageResponse.status).toBe(200);
      const secondPage = await secondPageResponse.json();
      expect(secondPage.requests).toHaveLength(1);
      expect(secondPage.total).toBe(totalResolvedRequests);

      // The two pages are disjoint and together cover every resolved request.
      const firstPageIds = new Set(
        firstPage.requests.map((r: { sId: string }) => r.sId)
      );
      const secondPageIds = new Set(
        secondPage.requests.map((r: { sId: string }) => r.sId)
      );
      expect(firstPageIds.size).toBe(100);
      for (const id of secondPageIds) {
        expect(firstPageIds.has(id)).toBe(false);
      }
    });

    it("filters by decision", async () => {
      const workspace = await creditPricedWorkspace();
      const { user: approvedMember } = await createMemberRequest(workspace);
      const { user: deniedMember } = await createMemberRequest(workspace);

      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });
      const { requests: pendingRequests } = await (
        await honoApp.request(upgradeRequestsUrl(workspace.sId))
      ).json();
      const approvedRequestId = pendingRequests.find(
        (r: { requester: { sId: string } }) =>
          r.requester.sId === approvedMember.sId
      ).sId;
      const deniedRequestId = pendingRequests.find(
        (r: { requester: { sId: string } }) =>
          r.requester.sId === deniedMember.sId
      ).sId;

      await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}/${approvedRequestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "approved" }),
        }
      );
      await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}/${deniedRequestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "denied" }),
        }
      );

      const approvedResponse = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}?status=resolved&decision=approved`
      );
      const { requests: approvedRequests, total: approvedTotal } =
        await approvedResponse.json();
      expect(approvedTotal).toBe(1);
      expect(approvedRequests).toHaveLength(1);
      expect(approvedRequests[0].sId).toBe(approvedRequestId);

      const deniedResponse = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}?status=resolved&decision=denied`
      );
      const { requests: deniedRequests, total: deniedTotal } =
        await deniedResponse.json();
      expect(deniedTotal).toBe(1);
      expect(deniedRequests).toHaveLength(1);
      expect(deniedRequests[0].sId).toBe(deniedRequestId);

      const allResponse = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}?status=resolved`
      );
      expect((await allResponse.json()).total).toBe(2);
    });

    it("filters by requester name/email search", async () => {
      const workspace = await creditPricedWorkspace();
      const { user: matchingMember } = await createMemberRequest(workspace);
      const { user: otherMember } = await createMemberRequest(workspace);

      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });
      const { requests: pendingRequests } = await (
        await honoApp.request(upgradeRequestsUrl(workspace.sId))
      ).json();
      for (const request of pendingRequests) {
        await honoApp.request(
          `${upgradeRequestsUrl(workspace.sId)}/${request.sId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "denied" }),
          }
        );
      }

      const searchResponse = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}?status=resolved&search=${encodeURIComponent(matchingMember.email ?? "")}`
      );
      expect(searchResponse.status).toBe(200);
      const { requests: searchResults, total: searchTotal } =
        await searchResponse.json();
      expect(searchTotal).toBe(1);
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].requester.sId).toBe(matchingMember.sId);
      expect(
        searchResults.some(
          (r: { requester: { sId: string } }) =>
            r.requester.sId === otherMember.sId
        )
      ).toBe(false);
    });

    it("returns an empty page when the search matches no requester", async () => {
      const workspace = await creditPricedWorkspace();
      await createMemberRequest(workspace);

      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });
      const { requests: pendingRequests } = await (
        await honoApp.request(upgradeRequestsUrl(workspace.sId))
      ).json();
      await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}/${pendingRequests[0].sId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "denied" }),
        }
      );

      const searchResponse = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}?status=resolved&search=no-such-person`
      );
      expect(searchResponse.status).toBe(200);
      const { requests, total } = await searchResponse.json();
      expect(requests).toHaveLength(0);
      expect(total).toBe(0);
    });
  });

  describe("GET ?format=csv (history export)", () => {
    it("streams a CSV of the resolved requests", async () => {
      const workspace = await creditPricedWorkspace();
      const { user: member } = await createMemberRequest(workspace);

      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });
      const { sId: requestId } = (
        await (await honoApp.request(upgradeRequestsUrl(workspace.sId))).json()
      ).requests[0];

      await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "denied" }),
        }
      );

      const csvResponse = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}?format=csv`
      );

      expect(csvResponse.status).toBe(200);
      expect(csvResponse.headers.get("Content-Type")).toBe("text/csv");
      expect(csvResponse.headers.get("Content-Disposition")).toBe(
        'attachment; filename="dust_upgrade_requests_history.csv"'
      );

      const csv = await csvResponse.text();
      const [header, row] = csv.trim().split("\n");
      expect(header).toBe(
        "requesterName,requesterEmail,requestedAt,granted,until,reason,status,resolvedAt,resolvedBy"
      );
      expect(row).toContain(member.email);
      expect(row).toContain("Denied");
    });

    it("returns 403 when caller is a user", async () => {
      const workspace = await creditPricedWorkspace();
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
        workspace,
      });

      const response = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}?format=csv`
      );

      expect(response.status).toBe(403);
    });

    it("exports every resolved request, not just the first page", async () => {
      const workspace = await creditPricedWorkspace();
      const { user: member, auth: memberAuth } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "user",
          workspace,
        });

      const totalResolvedRequests = 101;
      for (let i = 0; i < totalResolvedRequests; i++) {
        const created = await MembershipUpgradeRequestResource.createPending(
          memberAuth,
          { user: member, reason: null }
        );
        if (created.isErr()) {
          throw created.error;
        }
        await created.value.markAsResolved(memberAuth, {
          status: i % 2 === 0 ? "approved" : "denied",
          resolvedByUser: member,
        });
      }

      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
        workspace,
      });

      const csvResponse = await honoApp.request(
        `${upgradeRequestsUrl(workspace.sId)}?format=csv`
      );
      expect(csvResponse.status).toBe(200);

      const csv = await csvResponse.text();
      const rows = csv.trim().split("\n");
      // Header + one row per resolved request, beyond the 100-per-page cap
      // the JSON endpoint enforces.
      expect(rows).toHaveLength(totalResolvedRequests + 1);
    });
  });
});
