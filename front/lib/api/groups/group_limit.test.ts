import {
  makeGroupLimitAwuCreditsRateLimitKeyForGroup,
  makeSpendLimitCycleWindowBounds,
} from "@app/lib/api/assistant/rate_limits";
import * as workosAudit from "@app/lib/api/audit/workos_audit";
import {
  areGroupLimitsEnabled,
  MAX_GROUP_LIMIT_AWU_CREDITS,
  recordGroupLimitUsage,
  resolveLimitGroupForUser,
  resolveLimitGroupsForUsers,
  setGroupLimit,
} from "@app/lib/api/groups/group_limit";
import { Authenticator } from "@app/lib/auth";
import { microCreditsToCredits } from "@app/lib/credits/units";
import * as planType from "@app/lib/metronome/plan_type";
import type * as seatTypes from "@app/lib/metronome/seat_types";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { UserResource } from "@app/lib/resources/user_resource";
import * as cycle from "@app/lib/spend_limits/cycle";
import {
  getFixedWindowCount,
  setFixedWindowCount,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import {
  mockActiveContract,
  POOL_ONLY_SEATS,
  SEAT_BASED_SEATS,
} from "@app/tests/utils/metronome_contracts";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { GroupLimit } from "@app/types/api/groups/group_limit";
import type { WithAccessControl } from "@app/types/resource_permissions";
import type { LightWorkspaceType } from "@app/types/user";
import { UniqueConstraintError } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@app/lib/api/redis");

vi.mock("@app/lib/metronome/plan_type", async () => {
  const actual = await vi.importActual<typeof planType>(
    "@app/lib/metronome/plan_type"
  );
  return { ...actual, getActiveContract: vi.fn() };
});

vi.mock("@app/lib/metronome/seat_types", async () => {
  const actual = await vi.importActual<typeof seatTypes>(
    "@app/lib/metronome/seat_types"
  );
  return { ...actual, getProductSeatTypes: vi.fn() };
});

vi.mock("@app/lib/api/audit/workos_audit", async () => {
  const actual = await vi.importActual<typeof workosAudit>(
    "@app/lib/api/audit/workos_audit"
  );
  return { ...actual, emitAuditLogEvent: vi.fn() };
});

vi.mock("@app/lib/spend_limits/cycle", async () => {
  const actual = await vi.importActual<typeof cycle>(
    "@app/lib/spend_limits/cycle"
  );
  return { ...actual, resolveSpendLimitCycleBounds: vi.fn() };
});

const AUDIT_CONTEXT = { location: "127.0.0.1" };

const BOUNDS = makeSpendLimitCycleWindowBounds(
  new Date("2026-10-01T00:00:00Z"),
  new Date("2026-11-01T00:00:00Z")
);

beforeEach(() => {
  mockActiveContract(POOL_ONLY_SEATS);
  vi.mocked(workosAudit.emitAuditLogEvent).mockResolvedValue(undefined);
  vi.mocked(cycle.resolveSpendLimitCycleBounds).mockResolvedValue(BOUNDS);
});

async function setup({ withFlag = true }: { withFlag?: boolean } = {}) {
  const {
    authenticator: auth,
    workspace,
    user,
  } = await createResourceTest({ role: "admin", plan: "creditPriced" });
  if (withFlag) {
    await FeatureFlagFactory.basic(auth, "group_limits");
  }
  return { auth, workspace, user };
}

async function setupWithAgentMessage({
  withFlag = true,
}: {
  withFlag?: boolean;
} = {}) {
  const { auth, workspace, user } = await setup({ withFlag });
  const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
    name: "Test Agent",
    description: "Test Agent",
  });
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfig.sId,
    messagesCreatedAt: [],
  });
  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig,
  });
  return { auth, workspace, user, agentMessageId: agentMessage.sId };
}

async function makeMember(
  workspace: LightWorkspaceType
): Promise<UserResource> {
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "user" });
  return user;
}

async function makeGroup(
  auth: Authenticator,
  workspace: LightWorkspaceType,
  name: string,
  members: UserResource[]
): Promise<GroupResource> {
  const group = await GroupFactory.regularManual(workspace, name);
  const added = await GroupFactory.withMembers(auth, group, members);
  if (added.isErr()) {
    throw added.error;
  }
  const reset = await setFixedWindowCount({
    key: makeGroupLimitAwuCreditsRateLimitKeyForGroup(workspace, group),
    bounds: BOUNDS,
    value: 0,
    logger,
  });
  if (reset.isErr()) {
    throw reset.error;
  }
  return group;
}

async function setLimit(
  auth: Authenticator,
  group: GroupResource,
  limit: GroupLimit
) {
  return setGroupLimit(auth, {
    groupId: group.sId,
    limit,
    auditContext: AUDIT_CONTEXT,
  });
}

async function limit(
  auth: Authenticator,
  group: GroupResource,
  awuCredits: number | null
) {
  const result = await setLimit(
    auth,
    group,
    awuCredits === null
      ? { kind: "unlimited" }
      : { kind: "limited", awuCredits }
  );
  if (result.isErr()) {
    throw result.error;
  }
}

async function makeLimitedGroup(
  auth: Authenticator,
  workspace: LightWorkspaceType,
  name: string,
  members: UserResource[],
  awuCredits: number
): Promise<GroupResource> {
  const group = await makeGroup(auth, workspace, name, members);
  await limit(auth, group, awuCredits);
  return group;
}

async function reload(auth: Authenticator, group: GroupResource) {
  const res = await GroupResource.fetchById(auth, group.sId);
  if (res.isErr()) {
    throw res.error;
  }
  return {
    groupLimitAwuCredits: res.value.groupLimitAwuCredits,
    groupLimitPriority: res.value.groupLimitPriority,
  };
}

async function groupUsage(
  workspace: LightWorkspaceType,
  group: GroupResource
): Promise<number> {
  const count = await getFixedWindowCount({
    key: makeGroupLimitAwuCreditsRateLimitKeyForGroup(workspace, group),
    bounds: BOUNDS,
  });
  if (count.isErr()) {
    throw count.error;
  }
  return microCreditsToCredits(count.value);
}

async function storedLimitGroupModelId(
  auth: Authenticator,
  agentMessageId: string
) {
  const stored = await ConversationResource.fetchAgentMessageLimitGroup(auth, {
    agentMessageId,
  });
  return stored?.limitGroupModelId ?? null;
}

function isGroupResource(target: WithAccessControl): target is GroupResource {
  return target instanceof GroupResource;
}

describe("areGroupLimitsEnabled", () => {
  it("is enabled on a pool-only contract with the flag on", async () => {
    const { auth } = await setup();

    expect(await areGroupLimitsEnabled(auth)).toBe(true);
  });

  it("is disabled when the flag is off", async () => {
    const { auth } = await setup({ withFlag: false });

    expect(await areGroupLimitsEnabled(auth)).toBe(false);
  });

  it("is disabled when the contract sells personal-credit seats", async () => {
    mockActiveContract(SEAT_BASED_SEATS);
    const { auth } = await setup();

    expect(await areGroupLimitsEnabled(auth)).toBe(false);
  });

  it("is disabled when the active contract cannot be resolved", async () => {
    vi.mocked(planType.getActiveContract).mockResolvedValue(null);
    const { auth } = await setup();

    expect(await areGroupLimitsEnabled(auth)).toBe(false);
  });

  it("is disabled on a workspace that is not credit-priced", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await FeatureFlagFactory.basic(auth, "group_limits");

    expect(await areGroupLimitsEnabled(auth)).toBe(false);
    expect(planType.getActiveContract).not.toHaveBeenCalled();
  });
});

describe("setGroupLimit", () => {
  describe("priority", () => {
    it("assigns priorities in the order limits are first set", async () => {
      const { workspace, auth } = await setup();
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );
      const sales = await GroupFactory.regularManual(workspace, "Sales");

      expect(
        (
          await setLimit(auth, engineering, {
            kind: "limited",
            awuCredits: 10_000,
          })
        ).isOk()
      ).toBe(true);
      expect(
        (
          await setLimit(auth, sales, { kind: "limited", awuCredits: 6_000 })
        ).isOk()
      ).toBe(true);

      expect(await reload(auth, engineering)).toEqual({
        groupLimitAwuCredits: 10_000,
        groupLimitPriority: 1,
      });
      expect(await reload(auth, sales)).toEqual({
        groupLimitAwuCredits: 6_000,
        groupLimitPriority: 2,
      });
    });

    it("keeps the priority when the amount changes", async () => {
      const { workspace, auth } = await setup();
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );
      const sales = await GroupFactory.regularManual(workspace, "Sales");
      await setLimit(auth, engineering, {
        kind: "limited",
        awuCredits: 10_000,
      });
      await setLimit(auth, sales, { kind: "limited", awuCredits: 6_000 });

      await setLimit(auth, engineering, {
        kind: "limited",
        awuCredits: 15_000,
      });

      expect(await reload(auth, engineering)).toEqual({
        groupLimitAwuCredits: 15_000,
        groupLimitPriority: 1,
      });
    });

    it("clears both columns when the limit is removed", async () => {
      const { workspace, auth } = await setup();
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );
      await setLimit(auth, engineering, {
        kind: "limited",
        awuCredits: 10_000,
      });

      const result = await setLimit(auth, engineering, { kind: "unlimited" });

      expect(result.isOk()).toBe(true);
      expect(await reload(auth, engineering)).toEqual({
        groupLimitAwuCredits: null,
        groupLimitPriority: null,
      });
    });

    it("appends a group after the others when its limit is set again", async () => {
      const { workspace, auth } = await setup();
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );
      const sales = await GroupFactory.regularManual(workspace, "Sales");
      await setLimit(auth, engineering, {
        kind: "limited",
        awuCredits: 10_000,
      });
      await setLimit(auth, sales, { kind: "limited", awuCredits: 6_000 });
      await setLimit(auth, engineering, { kind: "unlimited" });

      await setLimit(auth, engineering, { kind: "limited", awuCredits: 1_000 });

      expect((await reload(auth, engineering)).groupLimitPriority).toBe(3);
      expect((await reload(auth, sales)).groupLimitPriority).toBe(2);
    });

    it("assigns a priority to a limited group that has none", async () => {
      const { workspace, auth } = await setup();
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );
      const sales = await GroupFactory.regularManual(workspace, "Sales");
      await setLimit(auth, sales, { kind: "limited", awuCredits: 6_000 });
      await GroupFactory.withRawGroupLimit(engineering, {
        groupLimitAwuCredits: 10_000,
        groupLimitPriority: null,
      });

      await setLimit(auth, engineering, {
        kind: "limited",
        awuCredits: 10_000,
      });

      expect(await reload(auth, engineering)).toEqual({
        groupLimitAwuCredits: 10_000,
        groupLimitPriority: 2,
      });
    });

    it("rejects a write that would reuse a taken priority", async () => {
      const { workspace, auth } = await setup();
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );
      const sales = await GroupFactory.regularManual(workspace, "Sales");
      await setLimit(auth, sales, { kind: "limited", awuCredits: 6_000 });
      // Simulates a concurrent first set that read the max before Sales got priority 1.
      vi.spyOn(GroupModel, "max").mockResolvedValueOnce(null);

      await expect(
        setLimit(auth, engineering, { kind: "limited", awuCredits: 10_000 })
      ).rejects.toBeInstanceOf(UniqueConstraintError);
    });
  });

  describe("validation and permissions", () => {
    it("refuses a group kind that cannot carry a group limit", async () => {
      const { auth } = await setup();
      const globalGroupRes =
        await GroupResource.fetchWorkspaceGlobalGroup(auth);
      if (globalGroupRes.isErr()) {
        throw globalGroupRes.error;
      }

      const result = await setLimit(auth, globalGroupRes.value, {
        kind: "limited",
        awuCredits: 1_000,
      });

      expect(result.isErr() && result.error.type).toBe("invalid_group_kind");
    });

    it("refuses non-admins, including members with usage-limit rights", async () => {
      const { workspace, auth } = await setup();
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );
      const member = await makeMember(workspace);
      const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
        member.sId,
        workspace.sId
      );

      const result = await setLimit(memberAuth, engineering, {
        kind: "limited",
        awuCredits: 1_000,
      });

      expect(result.isErr() && result.error.type).toBe("unauthorized");
      expect((await reload(auth, engineering)).groupLimitAwuCredits).toBeNull();
    });

    it("refuses when group limits are not enabled for the workspace", async () => {
      const { workspace, auth } = await setup({ withFlag: false });
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );

      const result = await setLimit(auth, engineering, {
        kind: "limited",
        awuCredits: 1_000,
      });

      expect(result.isErr() && result.error.type).toBe(
        "group_limits_not_enabled"
      );
      expect((await reload(auth, engineering)).groupLimitAwuCredits).toBeNull();
    });

    it("refuses amounts outside the allowed range", async () => {
      const { workspace, auth } = await setup();
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );

      for (const awuCredits of [-1, 1.5, MAX_GROUP_LIMIT_AWU_CREDITS + 1]) {
        const result = await setLimit(auth, engineering, {
          kind: "limited",
          awuCredits,
        });
        expect(result.isErr() && result.error.type).toBe("invalid_threshold");
      }
      expect((await reload(auth, engineering)).groupLimitAwuCredits).toBeNull();
    });
  });

  it("emits a group.group_limit_updated audit event", async () => {
    const { workspace, auth } = await setup();
    const engineering = await GroupFactory.regularManual(
      workspace,
      "Engineering"
    );
    await setLimit(auth, engineering, { kind: "limited", awuCredits: 10_000 });

    await setLimit(auth, engineering, { kind: "limited", awuCredits: 12_000 });

    expect(workosAudit.emitAuditLogEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "group.group_limit_updated",
        metadata: {
          kind: "limited",
          awu_credits: "12000",
          previous_kind: "limited",
          previous_awu_credits: "10000",
        },
      })
    );
  });
});

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
    const removed = await GroupFactory.withRemovedMembers(auth, engineering, [
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
    const { workspace, auth } = await setup({ withFlag: false });
    const remy = await makeMember(workspace);
    const engineering = await makeGroup(auth, workspace, "Engineering", [remy]);
    await GroupFactory.withRawGroupLimit(engineering, {
      groupLimitAwuCredits: 10_000,
      groupLimitPriority: 1,
    });

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

describe("read filter", () => {
  it("resolves the member's own limit group with the member's auth", async () => {
    const { workspace, auth } = await setup();
    const remy = await makeMember(workspace);
    const engineering = await makeGroup(auth, workspace, "Engineering", [remy]);
    await limit(auth, engineering, 10_000);
    const remyAuth = await Authenticator.fromUserIdAndWorkspaceId(
      remy.sId,
      workspace.sId
    );

    expect(
      (await resolveLimitGroupForUser(remyAuth, { user: remy }))?.sId
    ).toBe(engineering.sId);
  });

  it("returns nothing to a caller who cannot read the member's groups", async () => {
    const { workspace, auth } = await setup();
    const remy = await makeMember(workspace);
    const engineering = await makeGroup(auth, workspace, "Engineering", [remy]);
    await limit(auth, engineering, 10_000);
    const outsider = await UserFactory.basic();
    const outsiderAuth = await Authenticator.fromUserIdAndWorkspaceId(
      outsider.sId,
      workspace.sId
    );

    expect(
      await resolveLimitGroupForUser(outsiderAuth, { user: remy })
    ).toBeNull();
  });

  it("drops a member whose limit group is unreadable instead of reassigning them", async () => {
    const { workspace, auth } = await setup();
    const remy = await makeMember(workspace);
    const engineering = await makeGroup(auth, workspace, "Engineering", [remy]);
    const sales = await makeGroup(auth, workspace, "Sales", [remy]);
    await limit(auth, engineering, 10_000);
    await limit(auth, sales, 6_000);
    vi.spyOn(auth, "can").mockImplementation(
      (_verb, target) =>
        !(isGroupResource(target) && target.id === engineering.id)
    );

    expect(await resolveLimitGroupForUser(auth, { user: remy })).toBeNull();
  });
});

describe("recordGroupLimitUsage", () => {
  it("records the credits to the member's limit group and stores it on the message", async () => {
    const { auth, workspace, user, agentMessageId } =
      await setupWithAgentMessage();
    const engineering = await makeLimitedGroup(
      auth,
      workspace,
      "Engineering",
      [user],
      10_000
    );

    await recordGroupLimitUsage(auth, { user, agentMessageId, incrementBy: 3 });

    expect(await groupUsage(workspace, engineering)).toBe(3);
    expect(await storedLimitGroupModelId(auth, agentMessageId)).toBe(
      engineering.id
    );
  });

  it("keeps recording a message to its stored group after the limits change", async () => {
    const { auth, workspace, user, agentMessageId } =
      await setupWithAgentMessage();
    const engineering = await makeLimitedGroup(
      auth,
      workspace,
      "Engineering",
      [user],
      10_000
    );
    await recordGroupLimitUsage(auth, { user, agentMessageId, incrementBy: 3 });
    await limit(auth, engineering, null);
    const sales = await makeLimitedGroup(
      auth,
      workspace,
      "Sales",
      [user],
      6_000
    );

    await recordGroupLimitUsage(auth, { user, agentMessageId, incrementBy: 2 });

    expect(await groupUsage(workspace, engineering)).toBe(5);
    expect(await groupUsage(workspace, sales)).toBe(0);
  });

  it("records nothing once the stored group has been deleted", async () => {
    const { auth, workspace, user, agentMessageId } =
      await setupWithAgentMessage();
    const engineering = await makeLimitedGroup(
      auth,
      workspace,
      "Engineering",
      [user],
      10_000
    );
    await recordGroupLimitUsage(auth, { user, agentMessageId, incrementBy: 3 });
    const deleted = await engineering.delete(auth);
    if (deleted.isErr()) {
      throw deleted.error;
    }

    await recordGroupLimitUsage(auth, { user, agentMessageId, incrementBy: 2 });

    expect(await groupUsage(workspace, engineering)).toBe(3);
  });

  it("records nothing while the member has no limit group, then counts later recordings", async () => {
    const { auth, workspace, user, agentMessageId } =
      await setupWithAgentMessage();

    await recordGroupLimitUsage(auth, { user, agentMessageId, incrementBy: 3 });
    expect(await storedLimitGroupModelId(auth, agentMessageId)).toBeNull();

    const engineering = await makeLimitedGroup(
      auth,
      workspace,
      "Engineering",
      [user],
      10_000
    );
    await recordGroupLimitUsage(auth, { user, agentMessageId, incrementBy: 2 });

    expect(await groupUsage(workspace, engineering)).toBe(2);
    expect(await storedLimitGroupModelId(auth, agentMessageId)).toBe(
      engineering.id
    );
  });

  it("writes nothing when group limits are not enabled", async () => {
    const { auth, workspace, user, agentMessageId } =
      await setupWithAgentMessage({ withFlag: false });
    const engineering = await makeGroup(auth, workspace, "Engineering", [user]);
    await GroupFactory.withRawGroupLimit(engineering, {
      groupLimitAwuCredits: 10_000,
      groupLimitPriority: 1,
    });

    await recordGroupLimitUsage(auth, { user, agentMessageId, incrementBy: 3 });

    expect(await groupUsage(workspace, engineering)).toBe(0);
    expect(await storedLimitGroupModelId(auth, agentMessageId)).toBeNull();
  });

  it("stores the group but writes no counter when the billing cycle is unknown", async () => {
    const { auth, workspace, user, agentMessageId } =
      await setupWithAgentMessage();
    const engineering = await makeLimitedGroup(
      auth,
      workspace,
      "Engineering",
      [user],
      10_000
    );
    vi.mocked(cycle.resolveSpendLimitCycleBounds).mockResolvedValue(null);

    await recordGroupLimitUsage(auth, { user, agentMessageId, incrementBy: 3 });

    expect(await groupUsage(workspace, engineering)).toBe(0);
    expect(await storedLimitGroupModelId(auth, agentMessageId)).toBe(
      engineering.id
    );
  });

  it("ignores non-positive or invalid amounts", async () => {
    const { auth, workspace, user, agentMessageId } =
      await setupWithAgentMessage();
    const engineering = await makeLimitedGroup(
      auth,
      workspace,
      "Engineering",
      [user],
      10_000
    );

    for (const incrementBy of [0, -1, Number.NaN]) {
      await recordGroupLimitUsage(auth, { user, agentMessageId, incrementBy });
    }

    expect(await groupUsage(workspace, engineering)).toBe(0);
    expect(await storedLimitGroupModelId(auth, agentMessageId)).toBeNull();
  });
});
