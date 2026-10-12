import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import {
  mockActiveContract,
  POOL_ONLY_SEATS,
} from "@app/tests/utils/metronome_contracts";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { LightWorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/metronome/plan_type"), async (importOriginal) => ({
  ...(await importOriginal()),
  getActiveContract: vi.fn(),
}));

vi.mock(import("@app/lib/metronome/seat_types"), async (importOriginal) => ({
  ...(await importOriginal()),
  getProductSeatTypes: vi.fn(),
}));

beforeEach(() => {
  mockActiveContract(POOL_ONLY_SEATS);
});

async function sharedUsageLimitsWorkspace({
  withFlag = true,
}: {
  withFlag?: boolean;
} = {}) {
  const workspace = await WorkspaceFactory.creditPriced();
  if (withFlag) {
    await FeatureFlagFactory.basic(
      await Authenticator.internalAdminForWorkspace(workspace.sId),
      "group_limits"
    );
  }
  return workspace;
}

async function makeMembers(workspace: LightWorkspaceType, count: number) {
  const users: UserResource[] = [];
  for (let i = 0; i < count; i++) {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    users.push(user);
  }
  return users;
}

async function makeGroup(
  workspace: LightWorkspaceType,
  name: string,
  members: UserResource[],
  sharedUsageLimit?: { awuCredits: number; priority: number }
): Promise<GroupResource> {
  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  const group = await GroupFactory.regularManual(workspace, name);
  const added = await GroupFactory.withMembers(adminAuth, group, members);
  if (added.isErr()) {
    throw added.error;
  }
  if (sharedUsageLimit) {
    await GroupFactory.withRawSharedUsageLimit(group, {
      sharedUsageLimitAwuCredits: sharedUsageLimit.awuCredits,
      sharedUsageLimitPriority: sharedUsageLimit.priority,
    });
  }
  return group;
}

async function makeOverlappingGroups(workspace: LightWorkspaceType) {
  const [alice, bob, carol, dave] = await makeMembers(workspace, 4);
  const engineering = await makeGroup(workspace, "Engineering", [alice, bob], {
    awuCredits: 1_000,
    priority: 3,
  });
  const sales = await makeGroup(workspace, "Sales", [bob, carol], {
    awuCredits: 500,
    priority: 7,
  });
  const updated = await sales.updatePoolCap(200);
  if (updated.isErr()) {
    throw updated.error;
  }
  const support = await makeGroup(workspace, "Support", [dave], {
    awuCredits: 300,
    priority: 9,
  });
  const product = await makeGroup(workspace, "Product", [alice, carol]);
  return { engineering, sales, support, product };
}

function getOverlaps(wId: string, groupId: string) {
  return honoApp.request(
    `/api/w/${wId}/groups/${groupId}/shared_usage_limit/overlaps`
  );
}

describe("GET /api/w/[wId]/groups/[groupId]/shared_usage_limit/overlaps", () => {
  it("lists every group with a budget in order, with the members each shares with the group", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const { engineering, sales, support } =
      await makeOverlappingGroups(workspace);
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await getOverlaps(workspace.sId, sales.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      groups: [
        {
          groupId: engineering.sId,
          name: "Engineering",
          position: 1,
          limitAwuCredits: 1_000,
          poolCapAwuCredits: null,
          sharedMemberCount: 1,
        },
        {
          groupId: sales.sId,
          name: "Sales",
          position: 2,
          limitAwuCredits: 500,
          poolCapAwuCredits: 200,
          sharedMemberCount: null,
        },
        {
          groupId: support.sId,
          name: "Support",
          position: 3,
          limitAwuCredits: 300,
          poolCapAwuCredits: null,
          sharedMemberCount: 0,
        },
      ],
    });
  });

  it("works for a group without a budget", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const { engineering, sales, support, product } =
      await makeOverlappingGroups(workspace);
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await getOverlaps(workspace.sId, product.sId);

    expect(response.status).toBe(200);
    const { groups } = await response.json();
    expect(
      groups.map(
        ({
          groupId,
          sharedMemberCount,
        }: {
          groupId: string;
          sharedMemberCount: number | null;
        }) => [groupId, sharedMemberCount]
      )
    ).toEqual([
      [engineering.sId, 1],
      [sales.sId, 1],
      [support.sId, 0],
    ]);
  });

  it("lets a workspace manager read the overlaps", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const { sales } = await makeOverlappingGroups(workspace);
    await createPrivateApiMockRequest({
      method: "GET",
      role: "manager",
      workspace,
    });

    const response = await getOverlaps(workspace.sId, sales.sId);

    expect(response.status).toBe(200);
  });

  it("refuses a regular member", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const { sales } = await makeOverlappingGroups(workspace);
    await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
      workspace,
    });

    const response = await getOverlaps(workspace.sId, sales.sId);

    expect(response.status).toBe(403);
  });

  it("refuses a group manager of that group", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const { sales } = await makeOverlappingGroups(workspace);
    const { user: delegate } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
      workspace,
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const grant = await GroupPermissionResource.grantToUser(adminAuth, {
      user: delegate.toJSON(),
      grantType: "group_manager",
      resourceType: "group",
      resourceId: sales.id,
    });
    expect(grant.isOk()).toBe(true);

    const response = await getOverlaps(workspace.sId, sales.sId);

    expect(response.status).toBe(403);
  });

  it("returns 404 when the group does not exist", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await getOverlaps(workspace.sId, "unknown-group");

    expect(response.status).toBe(404);
  });

  it("returns 400 for a group that cannot carry a budget", async () => {
    const workspace = await sharedUsageLimitsWorkspace();
    const { globalGroup } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await getOverlaps(workspace.sId, globalGroup.sId);

    expect(response.status).toBe(400);
  });

  it("returns 403 when shared usage limits are not enabled", async () => {
    const workspace = await sharedUsageLimitsWorkspace({ withFlag: false });
    const { sales } = await makeOverlappingGroups(workspace);
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await getOverlaps(workspace.sId, sales.sId);

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("feature_flag_not_found");
  });
});
