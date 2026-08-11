import {
  listAllResolvedUpgradeRequests,
  RESOLVED_UPGRADE_REQUESTS_HISTORY_PAGE_SIZE,
} from "@app/lib/api/credits/upgrade_requests";
import { Authenticator } from "@app/lib/auth";
import { MembershipUpgradeRequestResource } from "@app/lib/resources/membership_upgrade_request_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { Result } from "@app/types/shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function setupWorkspaceWithAdminAndMember() {
  const workspace = await WorkspaceFactory.metronome({
    metronomeCustomerId: "cust_test_xxx",
  });
  const adminUser = await UserFactory.basic();
  const memberUser = await UserFactory.basic();
  await MembershipFactory.associate(workspace, adminUser, { role: "admin" });
  await MembershipFactory.associate(workspace, memberUser, { role: "user" });
  const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
    adminUser.sId,
    workspace.sId
  );
  return { workspace, adminAuth, memberUser };
}

async function createResolvedRequest(
  adminAuth: Authenticator,
  memberUser: Awaited<ReturnType<typeof UserFactory.basic>>
) {
  const request = unwrap(
    await MembershipUpgradeRequestResource.createPending(adminAuth, {
      user: memberUser,
      reason: null,
    })
  );
  await request.markAsResolved(adminAuth, {
    status: "denied",
    resolvedByUser: memberUser,
  });
  return request;
}

describe("listAllResolvedUpgradeRequests", () => {
  it("does not duplicate or drop rows when a request is resolved between page fetches", async () => {
    const { adminAuth, memberUser } = await setupWorkspaceWithAdminAndMember();

    // More than one page's worth of pre-existing resolved requests, so the
    // export has to fetch at least two pages.
    const preExistingCount = RESOLVED_UPGRADE_REQUESTS_HISTORY_PAGE_SIZE + 50;
    const preExistingIds: string[] = [];
    for (let i = 0; i < preExistingCount; i++) {
      const request = await createResolvedRequest(adminAuth, memberUser);
      preExistingIds.push(request.sId);
    }

    const original =
      MembershipUpgradeRequestResource.listResolvedByWorkspaceAfter.bind(
        MembershipUpgradeRequestResource
      );
    const spy = vi.spyOn(
      MembershipUpgradeRequestResource,
      "listResolvedByWorkspaceAfter"
    );
    let concurrentRequestId: string | null = null;
    spy.mockImplementation(async (auth, opts) => {
      const page = await original(auth, opts);
      if (spy.mock.calls.length === 1) {
        // Simulate another admin resolving a brand-new request in the gap
        // between this page's fetch and the next one being issued.
        const concurrent = await createResolvedRequest(adminAuth, memberUser);
        concurrentRequestId = concurrent.sId;
      }
      return page;
    });

    const exported = await listAllResolvedUpgradeRequests(adminAuth);
    const exportedIds = exported.map((r) => r.sId);

    expect(spy.mock.calls.length).toBeGreaterThan(1);
    expect(new Set(exportedIds).size).toBe(exportedIds.length);
    for (const id of preExistingIds) {
      expect(exportedIds).toContain(id);
    }
    expect(exportedIds).toHaveLength(preExistingCount);
    expect(exportedIds).not.toContain(concurrentRequestId);
  });
});
