import * as workosAudit from "@app/lib/api/audit/workos_audit";
import { setGroupLimit } from "@app/lib/api/groups/group_limit";
import { areGroupLimitsEnabled } from "@app/lib/api/groups/group_limit_eligibility";
import {
  resolveLimitGroupForUser,
  resolveLimitGroupsForUsers,
} from "@app/lib/api/groups/limit_group";
import { Authenticator } from "@app/lib/auth";
import type { GroupResource } from "@app/lib/resources/group_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/groups/group_limit_eligibility", () => ({
  areGroupLimitsEnabled: vi.fn(),
}));

vi.mock("@app/lib/api/audit/workos_audit", async () => {
  const actual = await vi.importActual<typeof workosAudit>(
    "@app/lib/api/audit/workos_audit"
  );
  return { ...actual, emitAuditLogEvent: vi.fn() };
});

beforeEach(() => {
  vi.mocked(areGroupLimitsEnabled).mockResolvedValue(true);
  vi.mocked(workosAudit.emitAuditLogEvent).mockResolvedValue(undefined);
});

async function setup() {
  const workspace = await WorkspaceFactory.creditPriced();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  return { workspace, auth };
}

async function makeMember(workspace: WorkspaceType): Promise<UserResource> {
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "user" });
  return user;
}

async function makeGroup(
  auth: Authenticator,
  workspace: WorkspaceType,
  name: string,
  members: UserResource[]
): Promise<GroupResource> {
  const group = await GroupFactory.regularManual(workspace, name);
  const added = await GroupFactory.withMembers(auth, group, members);
  if (added.isErr()) {
    throw added.error;
  }
  return group;
}

async function limit(
  auth: Authenticator,
  group: GroupResource,
  awuCredits: number | null
) {
  const result = await setGroupLimit(auth, {
    groupId: group.sId,
    limit:
      awuCredits === null
        ? { kind: "unlimited" }
        : { kind: "limited", awuCredits },
    auditContext: { location: "127.0.0.1" },
  });
  if (result.isErr()) {
    throw result.error;
  }
}

describe("resolveLimitGroupForUser", () => {
  it("returns nothing when none of the member's groups has a limit", async () => {
    const { workspace, auth } = await setup();
    const remy = await makeMember(workspace);
    await makeGroup(auth, workspace, "Engineering", [remy]);

    expect(await resolveLimitGroupForUser(auth, { user: remy })).toBeNull();
  });

  it("returns the member's only limited group", async () => {
    const { workspace, auth } = await setup();
    const remy = await makeMember(workspace);
    const engineering = await makeGroup(auth, workspace, "Engineering", [remy]);
    await makeGroup(auth, workspace, "Sales", [remy]);
    await limit(auth, engineering, 10_000);

    const limitGroup = await resolveLimitGroupForUser(auth, { user: remy });

    expect(limitGroup?.sId).toBe(engineering.sId);
    expect(limitGroup?.groupLimitAwuCredits).toBe(10_000);
  });

  it("returns the group whose limit was set first", async () => {
    const { workspace, auth } = await setup();
    const remy = await makeMember(workspace);
    const engineering = await makeGroup(auth, workspace, "Engineering", [remy]);
    const sales = await makeGroup(auth, workspace, "Sales", [remy]);
    await limit(auth, engineering, 10_000);
    await limit(auth, sales, 6_000);

    expect((await resolveLimitGroupForUser(auth, { user: remy }))?.sId).toBe(
      engineering.sId
    );
  });

  it("falls back to the next limited group when the first one loses its limit", async () => {
    const { workspace, auth } = await setup();
    const remy = await makeMember(workspace);
    const engineering = await makeGroup(auth, workspace, "Engineering", [remy]);
    const sales = await makeGroup(auth, workspace, "Sales", [remy]);
    await limit(auth, engineering, 10_000);
    await limit(auth, sales, 6_000);

    await limit(auth, engineering, null);
    expect((await resolveLimitGroupForUser(auth, { user: remy }))?.sId).toBe(
      sales.sId
    );

    await limit(auth, engineering, 10_000);
    expect((await resolveLimitGroupForUser(auth, { user: remy }))?.sId).toBe(
      sales.sId
    );
  });

  it("ignores limited groups the member is not in", async () => {
    const { workspace, auth } = await setup();
    const remy = await makeMember(workspace);
    const alice = await makeMember(workspace);
    await makeGroup(auth, workspace, "Engineering", [remy]);
    const sales = await makeGroup(auth, workspace, "Sales", [alice]);
    await limit(auth, sales, 6_000);

    expect(await resolveLimitGroupForUser(auth, { user: remy })).toBeNull();
  });

  it("ignores group memberships that have ended", async () => {
    const { workspace, auth } = await setup();
    const remy = await makeMember(workspace);
    const alice = await makeMember(workspace);
    const engineering = await makeGroup(auth, workspace, "Engineering", [
      remy,
      alice,
    ]);
    await limit(auth, engineering, 10_000);
    const removed = await GroupFactory.withoutMembers(auth, engineering, [
      remy,
    ]);
    if (removed.isErr()) {
      throw removed.error;
    }

    expect(await resolveLimitGroupForUser(auth, { user: remy })).toBeNull();
  });

  it("ignores groups whose kind cannot carry a group limit", async () => {
    const { workspace, auth } = await setup();
    const remy = await makeMember(workspace);
    const autoGroup = await GroupFactory.regularAuto(workspace, "Auto");
    const added = await GroupFactory.withMembers(auth, autoGroup, [remy]);
    if (added.isErr()) {
      throw added.error;
    }
    await GroupFactory.withRawGroupLimit(autoGroup, {
      groupLimitAwuCredits: 1_000,
      groupLimitPriority: 1,
    });

    expect(await resolveLimitGroupForUser(auth, { user: remy })).toBeNull();
  });

  it("returns nothing when group limits are not enabled", async () => {
    const { workspace, auth } = await setup();
    const remy = await makeMember(workspace);
    const engineering = await makeGroup(auth, workspace, "Engineering", [remy]);
    await limit(auth, engineering, 10_000);
    vi.mocked(areGroupLimitsEnabled).mockResolvedValue(false);

    expect(await resolveLimitGroupForUser(auth, { user: remy })).toBeNull();
  });
});

describe("resolveLimitGroupsForUsers", () => {
  it("resolves each member's limit group in one call", async () => {
    const { workspace, auth } = await setup();
    const remy = await makeMember(workspace);
    const alice = await makeMember(workspace);
    const bruno = await makeMember(workspace);
    const engineering = await makeGroup(auth, workspace, "Engineering", [
      remy,
      alice,
    ]);
    const sales = await makeGroup(auth, workspace, "Sales", [remy, bruno]);
    await makeGroup(auth, workspace, "Marketing", [bruno]);
    await limit(auth, sales, 6_000);
    await limit(auth, engineering, 10_000);
    const carol = await makeMember(workspace);

    const limitGroups = await resolveLimitGroupsForUsers(auth, {
      users: [remy, alice, bruno, carol],
    });

    expect(limitGroups.get(remy.sId)?.sId).toBe(sales.sId);
    expect(limitGroups.get(alice.sId)?.sId).toBe(engineering.sId);
    expect(limitGroups.get(bruno.sId)?.sId).toBe(sales.sId);
    expect(limitGroups.has(carol.sId)).toBe(false);
  });
});
