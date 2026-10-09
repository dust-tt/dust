import {
  makeSharedUsageLimitAwuCreditsRateLimitKeyForGroup,
  makeSpendLimitCycleWindowBounds,
} from "@app/lib/api/assistant/rate_limits";
import { emitAuditLogEvent } from "@app/lib/api/audit/workos_audit";
import { isUserBlocked } from "@app/lib/api/credits/access_control";
import { resolveMetronomeCycle } from "@app/lib/api/credits/members_usage";
import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import {
  areGroupSharedUsageLimitsEnabled,
  isGroupSharedUsageLimitReached,
  recordGroupSharedUsage,
  resolveSharedUsageLimitGroupForUser,
  resolveSharedUsageLimitGroupsForUsers,
  resyncGroupSharedUsageCountersFromEsUsage,
  setGroupSharedUsageLimit,
} from "@app/lib/api/groups/group_shared_usage_limit";
import { setGroupSpendLimit } from "@app/lib/api/groups/spend_limit";
import { Authenticator } from "@app/lib/auth";
import { microCreditsToCredits } from "@app/lib/credits/units";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { UserResource } from "@app/lib/resources/user_resource";
import { resolveSpendLimitCycleBounds } from "@app/lib/spend_limits/cycle";
import {
  expireRateLimiterKey,
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
import { MAX_SHARED_USAGE_LIMIT_AWU_CREDITS } from "@app/types/api/groups/shared_usage_limit";
import type { SharedUsageLimit } from "@app/types/api/groups/shared_usage_limit";
import type { WithAccessControl } from "@app/types/resource_permissions";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { UniqueConstraintError } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@app/lib/api/redis");

vi.mock(import("@app/lib/metronome/plan_type"), async (importOriginal) => ({
  ...(await importOriginal()),
  getActiveContract: vi.fn(),
}));

vi.mock(import("@app/lib/metronome/seat_types"), async (importOriginal) => ({
  ...(await importOriginal()),
  getProductSeatTypes: vi.fn(),
}));

vi.mock(import("@app/lib/api/audit/workos_audit"), async (importOriginal) => ({
  ...(await importOriginal()),
  emitAuditLogEvent: vi.fn(),
}));

vi.mock(import("@app/lib/spend_limits/cycle"), async (importOriginal) => ({
  ...(await importOriginal()),
  resolveSpendLimitCycleBounds: vi.fn(),
}));

vi.mock(import("@app/lib/api/elasticsearch"), async (orig) => {
  const mod = await orig();
  return { ...mod, searchConsumptionAnalytics: vi.fn() };
});

vi.mock(
  import("@app/lib/api/credits/members_usage"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    resolveMetronomeCycle: vi.fn(),
  })
);

const AUDIT_CONTEXT = { location: "127.0.0.1" };

const CYCLE = {
  cycleStart: new Date("2026-10-01T00:00:00Z"),
  cycleEnd: new Date("2026-11-01T00:00:00Z"),
};

const BOUNDS = makeSpendLimitCycleWindowBounds(
  CYCLE.cycleStart,
  CYCLE.cycleEnd
);

beforeEach(() => {
  mockActiveContract(POOL_ONLY_SEATS);
  vi.mocked(emitAuditLogEvent).mockResolvedValue(undefined);
  vi.mocked(resolveSpendLimitCycleBounds).mockResolvedValue(BOUNDS);
  vi.mocked(resolveMetronomeCycle).mockResolvedValue(CYCLE);
  mockConsumedBySharedUsageLimitGroup([]);
});

function mockConsumedBySharedUsageLimitGroup(
  consumed: { group: GroupResource; microCredits: number }[]
) {
  vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
    new Ok({
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: { total: { value: 0, relation: "eq" }, hits: [] },
      aggregations: {
        by_shared_usage_limit_group: {
          buckets: consumed.map(({ group, microCredits }) => ({
            key: group.sId,
            credits: { value: microCredits },
          })),
        },
      },
    })
  );
}

function mockConsumptionReadFailure() {
  vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
    new Err(new ElasticsearchError("connection_error", "es down"))
  );
}

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
  const expired = await expireRateLimiterKey({
    key: `${makeSharedUsageLimitAwuCreditsRateLimitKeyForGroup(workspace, group)}:${BOUNDS.label}`,
  });
  if (expired.isErr()) {
    throw expired.error;
  }
  return group;
}

async function setLimit(
  auth: Authenticator,
  group: GroupResource,
  limit: SharedUsageLimit
) {
  return setGroupSharedUsageLimit(auth, {
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
    sharedUsageLimitAwuCredits: res.value.sharedUsageLimitAwuCredits,
    sharedUsageLimitPriority: res.value.sharedUsageLimitPriority,
  };
}

async function setCounter(
  workspace: LightWorkspaceType,
  group: GroupResource,
  microCredits: number
) {
  const result = await setFixedWindowCount({
    key: makeSharedUsageLimitAwuCreditsRateLimitKeyForGroup(workspace, group),
    bounds: BOUNDS,
    value: microCredits,
    logger,
  });
  if (result.isErr()) {
    throw result.error;
  }
}

async function groupUsage(
  workspace: LightWorkspaceType,
  group: GroupResource
): Promise<number> {
  const count = await getFixedWindowCount({
    key: makeSharedUsageLimitAwuCreditsRateLimitKeyForGroup(workspace, group),
    bounds: BOUNDS,
  });
  if (count.isErr()) {
    throw count.error;
  }
  return microCreditsToCredits(count.value);
}

async function storedSharedUsageLimitGroupModelId(
  auth: Authenticator,
  agentMessageId: string
) {
  const stored =
    await ConversationResource.fetchAgentMessageSharedUsageLimitGroup(auth, {
      agentMessageId,
    });
  return stored?.sharedUsageLimitGroupModelId ?? null;
}

function isGroupResource(target: WithAccessControl): target is GroupResource {
  return target instanceof GroupResource;
}

describe("areGroupSharedUsageLimitsEnabled", () => {
  it("is enabled on a pool-only contract with the flag on", async () => {
    const { auth } = await setup();

    expect(await areGroupSharedUsageLimitsEnabled(auth)).toBe(true);
  });

  it("is disabled when the flag is off", async () => {
    const { auth } = await setup({ withFlag: false });

    expect(await areGroupSharedUsageLimitsEnabled(auth)).toBe(false);
  });

  it("is disabled when the contract sells personal-credit seats", async () => {
    mockActiveContract(SEAT_BASED_SEATS);
    const { auth } = await setup();

    expect(await areGroupSharedUsageLimitsEnabled(auth)).toBe(false);
  });

  it("is disabled when the active contract cannot be resolved", async () => {
    vi.mocked(getActiveContract).mockResolvedValue(null);
    const { auth } = await setup();

    expect(await areGroupSharedUsageLimitsEnabled(auth)).toBe(false);
  });

  it("is disabled on a workspace that is not credit-priced", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await FeatureFlagFactory.basic(auth, "group_limits");

    expect(await areGroupSharedUsageLimitsEnabled(auth)).toBe(false);
    expect(getActiveContract).not.toHaveBeenCalled();
  });
});

describe("setGroupSharedUsageLimit", () => {
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
        sharedUsageLimitAwuCredits: 10_000,
        sharedUsageLimitPriority: 1,
      });
      expect(await reload(auth, sales)).toEqual({
        sharedUsageLimitAwuCredits: 6_000,
        sharedUsageLimitPriority: 2,
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
        sharedUsageLimitAwuCredits: 15_000,
        sharedUsageLimitPriority: 1,
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
        sharedUsageLimitAwuCredits: null,
        sharedUsageLimitPriority: null,
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

      expect((await reload(auth, engineering)).sharedUsageLimitPriority).toBe(
        3
      );
      expect((await reload(auth, sales)).sharedUsageLimitPriority).toBe(2);
    });

    it("gives a new priority when the limit was removed after the group was loaded", async () => {
      const { workspace, auth } = await setup();
      const sales = await GroupFactory.regularManual(workspace, "Sales");
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );
      await setLimit(auth, sales, { kind: "limited", awuCredits: 6_000 });
      await setLimit(auth, engineering, {
        kind: "limited",
        awuCredits: 10_000,
      });
      const loaded = await GroupResource.fetchById(auth, engineering.sId);
      if (loaded.isErr()) {
        throw loaded.error;
      }
      await GroupFactory.withRawSharedUsageLimit(engineering, {
        sharedUsageLimitAwuCredits: null,
        sharedUsageLimitPriority: null,
      });

      const { previousAwuCredits } =
        await loaded.value.updateSharedUsageLimit(15_000);

      expect(previousAwuCredits).toBeNull();
      expect(await reload(auth, engineering)).toEqual({
        sharedUsageLimitAwuCredits: 15_000,
        sharedUsageLimitPriority: 2,
      });
    });

    it("assigns a priority to a limited group that has none", async () => {
      const { workspace, auth } = await setup();
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );
      const sales = await GroupFactory.regularManual(workspace, "Sales");
      await setLimit(auth, sales, { kind: "limited", awuCredits: 6_000 });
      await GroupFactory.withRawSharedUsageLimit(engineering, {
        sharedUsageLimitAwuCredits: 10_000,
        sharedUsageLimitPriority: null,
      });

      await setLimit(auth, engineering, {
        kind: "limited",
        awuCredits: 10_000,
      });

      expect(await reload(auth, engineering)).toEqual({
        sharedUsageLimitAwuCredits: 10_000,
        sharedUsageLimitPriority: 2,
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
    it("refuses a group kind that cannot carry a shared usage limit", async () => {
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

    it("refuses regular members", async () => {
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
      expect(
        (await reload(auth, engineering)).sharedUsageLimitAwuCredits
      ).toBeNull();
    });

    it("refuses when shared usage limits are not enabled for the workspace", async () => {
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
        "shared_usage_limits_not_enabled"
      );
      expect(
        (await reload(auth, engineering)).sharedUsageLimitAwuCredits
      ).toBeNull();
    });

    it("refuses amounts outside the allowed range", async () => {
      const { workspace, auth } = await setup();
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );

      for (const awuCredits of [
        -1,
        1.5,
        MAX_SHARED_USAGE_LIMIT_AWU_CREDITS + 1,
      ]) {
        const result = await setLimit(auth, engineering, {
          kind: "limited",
          awuCredits,
        });
        expect(result.isErr() && result.error.type).toBe("invalid_threshold");
      }
      expect(
        (await reload(auth, engineering)).sharedUsageLimitAwuCredits
      ).toBeNull();
    });
  });

  it("emits a group.shared_usage_limit_updated audit event", async () => {
    const { workspace, auth } = await setup();
    const engineering = await GroupFactory.regularManual(
      workspace,
      "Engineering"
    );
    await setLimit(auth, engineering, { kind: "limited", awuCredits: 10_000 });

    await setLimit(auth, engineering, { kind: "limited", awuCredits: 12_000 });

    expect(emitAuditLogEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "group.shared_usage_limit_updated",
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

describe("resolveSharedUsageLimitGroupForUser", () => {
  it("returns nothing when none of the member's groups has a limit", async () => {
    const { workspace, auth } = await setup();
    const remy = await makeMember(workspace);
    await makeGroup(auth, workspace, "Engineering", [remy]);

    expect(
      await resolveSharedUsageLimitGroupForUser(auth, { user: remy })
    ).toBeNull();
  });

  it("returns the member's only limited group", async () => {
    const { workspace, auth } = await setup();
    const remy = await makeMember(workspace);
    const engineering = await makeGroup(auth, workspace, "Engineering", [remy]);
    await makeGroup(auth, workspace, "Sales", [remy]);
    await limit(auth, engineering, 10_000);

    const sharedUsageLimitGroup = await resolveSharedUsageLimitGroupForUser(
      auth,
      {
        user: remy,
      }
    );

    expect(sharedUsageLimitGroup?.sId).toBe(engineering.sId);
    expect(sharedUsageLimitGroup?.sharedUsageLimitAwuCredits).toBe(10_000);
  });

  it("returns the group whose limit was set first", async () => {
    const { workspace, auth } = await setup();
    const remy = await makeMember(workspace);
    const engineering = await makeGroup(auth, workspace, "Engineering", [remy]);
    const sales = await makeGroup(auth, workspace, "Sales", [remy]);
    await limit(auth, engineering, 10_000);
    await limit(auth, sales, 6_000);

    expect(
      (await resolveSharedUsageLimitGroupForUser(auth, { user: remy }))?.sId
    ).toBe(engineering.sId);
  });

  it("falls back to the next limited group when the first one loses its limit", async () => {
    const { workspace, auth } = await setup();
    const remy = await makeMember(workspace);
    const engineering = await makeGroup(auth, workspace, "Engineering", [remy]);
    const sales = await makeGroup(auth, workspace, "Sales", [remy]);
    await limit(auth, engineering, 10_000);
    await limit(auth, sales, 6_000);

    await limit(auth, engineering, null);
    expect(
      (await resolveSharedUsageLimitGroupForUser(auth, { user: remy }))?.sId
    ).toBe(sales.sId);

    await limit(auth, engineering, 10_000);
    expect(
      (await resolveSharedUsageLimitGroupForUser(auth, { user: remy }))?.sId
    ).toBe(sales.sId);
  });

  it("ignores limited groups the member is not in", async () => {
    const { workspace, auth } = await setup();
    const remy = await makeMember(workspace);
    const alice = await makeMember(workspace);
    await makeGroup(auth, workspace, "Engineering", [remy]);
    const sales = await makeGroup(auth, workspace, "Sales", [alice]);
    await limit(auth, sales, 6_000);

    expect(
      await resolveSharedUsageLimitGroupForUser(auth, { user: remy })
    ).toBeNull();
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

    expect(
      await resolveSharedUsageLimitGroupForUser(auth, { user: remy })
    ).toBeNull();
  });

  it("ignores groups whose kind cannot carry a shared usage limit", async () => {
    const { workspace, auth } = await setup();
    const remy = await makeMember(workspace);
    const autoGroup = await GroupFactory.regularAuto(workspace, "Auto");
    const added = await GroupFactory.withMembers(auth, autoGroup, [remy]);
    if (added.isErr()) {
      throw added.error;
    }
    await GroupFactory.withRawSharedUsageLimit(autoGroup, {
      sharedUsageLimitAwuCredits: 1_000,
      sharedUsageLimitPriority: 1,
    });

    expect(
      await resolveSharedUsageLimitGroupForUser(auth, { user: remy })
    ).toBeNull();
  });

  it("returns nothing when shared usage limits are not enabled", async () => {
    const { workspace, auth } = await setup({ withFlag: false });
    const remy = await makeMember(workspace);
    const engineering = await makeGroup(auth, workspace, "Engineering", [remy]);
    await GroupFactory.withRawSharedUsageLimit(engineering, {
      sharedUsageLimitAwuCredits: 10_000,
      sharedUsageLimitPriority: 1,
    });

    expect(
      await resolveSharedUsageLimitGroupForUser(auth, { user: remy })
    ).toBeNull();
  });
});

describe("resolveSharedUsageLimitGroupsForUsers", () => {
  it("resolves each member's shared usage limit group in one call", async () => {
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

    const sharedUsageLimitGroups = await resolveSharedUsageLimitGroupsForUsers(
      auth,
      {
        users: [remy, alice, bruno, carol],
      }
    );

    expect(sharedUsageLimitGroups.get(remy.sId)?.sId).toBe(sales.sId);
    expect(sharedUsageLimitGroups.get(alice.sId)?.sId).toBe(engineering.sId);
    expect(sharedUsageLimitGroups.get(bruno.sId)?.sId).toBe(sales.sId);
    expect(sharedUsageLimitGroups.has(carol.sId)).toBe(false);
  });
});

describe("read filter", () => {
  it("resolves the member's own shared usage limit group with the member's auth", async () => {
    const { workspace, auth } = await setup();
    const remy = await makeMember(workspace);
    const engineering = await makeGroup(auth, workspace, "Engineering", [remy]);
    await limit(auth, engineering, 10_000);
    const remyAuth = await Authenticator.fromUserIdAndWorkspaceId(
      remy.sId,
      workspace.sId
    );

    expect(
      (await resolveSharedUsageLimitGroupForUser(remyAuth, { user: remy }))?.sId
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
      await resolveSharedUsageLimitGroupForUser(outsiderAuth, { user: remy })
    ).toBeNull();
  });

  it("drops a member whose shared usage limit group is unreadable instead of reassigning them", async () => {
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

    expect(
      await resolveSharedUsageLimitGroupForUser(auth, { user: remy })
    ).toBeNull();
  });
});

describe("recordGroupSharedUsage", () => {
  it("records the credits to the member's shared usage limit group and stores it on the message", async () => {
    const { auth, workspace, user, agentMessageId } =
      await setupWithAgentMessage();
    const engineering = await makeLimitedGroup(
      auth,
      workspace,
      "Engineering",
      [user],
      10_000
    );

    await recordGroupSharedUsage(auth, {
      user,
      agentMessageId,
      incrementBy: 3,
    });

    expect(await groupUsage(workspace, engineering)).toBe(3);
    expect(await storedSharedUsageLimitGroupModelId(auth, agentMessageId)).toBe(
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
    await recordGroupSharedUsage(auth, {
      user,
      agentMessageId,
      incrementBy: 3,
    });
    await limit(auth, engineering, null);
    const sales = await makeLimitedGroup(
      auth,
      workspace,
      "Sales",
      [user],
      6_000
    );

    await recordGroupSharedUsage(auth, {
      user,
      agentMessageId,
      incrementBy: 2,
    });

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
    await recordGroupSharedUsage(auth, {
      user,
      agentMessageId,
      incrementBy: 3,
    });
    const deleted = await engineering.delete(auth);
    if (deleted.isErr()) {
      throw deleted.error;
    }

    await recordGroupSharedUsage(auth, {
      user,
      agentMessageId,
      incrementBy: 2,
    });

    expect(await groupUsage(workspace, engineering)).toBe(3);
  });

  it("records nothing while the member has no shared usage limit group, then counts later recordings", async () => {
    const { auth, workspace, user, agentMessageId } =
      await setupWithAgentMessage();

    await recordGroupSharedUsage(auth, {
      user,
      agentMessageId,
      incrementBy: 3,
    });
    expect(
      await storedSharedUsageLimitGroupModelId(auth, agentMessageId)
    ).toBeNull();

    const engineering = await makeLimitedGroup(
      auth,
      workspace,
      "Engineering",
      [user],
      10_000
    );
    await recordGroupSharedUsage(auth, {
      user,
      agentMessageId,
      incrementBy: 2,
    });

    expect(await groupUsage(workspace, engineering)).toBe(2);
    expect(await storedSharedUsageLimitGroupModelId(auth, agentMessageId)).toBe(
      engineering.id
    );
  });

  it("writes nothing when shared usage limits are not enabled", async () => {
    const { auth, workspace, user, agentMessageId } =
      await setupWithAgentMessage({ withFlag: false });
    const engineering = await makeGroup(auth, workspace, "Engineering", [user]);
    await GroupFactory.withRawSharedUsageLimit(engineering, {
      sharedUsageLimitAwuCredits: 10_000,
      sharedUsageLimitPriority: 1,
    });

    await recordGroupSharedUsage(auth, {
      user,
      agentMessageId,
      incrementBy: 3,
    });

    expect(await groupUsage(workspace, engineering)).toBe(0);
    expect(
      await storedSharedUsageLimitGroupModelId(auth, agentMessageId)
    ).toBeNull();
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
    vi.mocked(resolveSpendLimitCycleBounds).mockResolvedValue(null);

    await recordGroupSharedUsage(auth, {
      user,
      agentMessageId,
      incrementBy: 3,
    });

    expect(await groupUsage(workspace, engineering)).toBe(0);
    expect(await storedSharedUsageLimitGroupModelId(auth, agentMessageId)).toBe(
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
      await recordGroupSharedUsage(auth, {
        user,
        agentMessageId,
        incrementBy,
      });
    }

    expect(await groupUsage(workspace, engineering)).toBe(0);
    expect(
      await storedSharedUsageLimitGroupModelId(auth, agentMessageId)
    ).toBeNull();
  });
});

describe("shared usage limit counter rebuild", () => {
  it("seeds an absent counter from the analytics index before recording", async () => {
    const { auth, workspace, user, agentMessageId } =
      await setupWithAgentMessage();
    const engineering = await makeLimitedGroup(
      auth,
      workspace,
      "Engineering",
      [user],
      10_000
    );
    mockConsumedBySharedUsageLimitGroup([
      { group: engineering, microCredits: 7_000_000 },
    ]);

    await recordGroupSharedUsage(auth, {
      user,
      agentMessageId,
      incrementBy: 3,
    });

    expect(await groupUsage(workspace, engineering)).toBe(10);
  });

  it("does not reseed a live counter", async () => {
    const { auth, workspace, user, agentMessageId } =
      await setupWithAgentMessage();
    const engineering = await makeLimitedGroup(
      auth,
      workspace,
      "Engineering",
      [user],
      10_000
    );
    await recordGroupSharedUsage(auth, {
      user,
      agentMessageId,
      incrementBy: 3,
    });
    mockConsumedBySharedUsageLimitGroup([
      { group: engineering, microCredits: 100_000_000 },
    ]);

    await recordGroupSharedUsage(auth, {
      user,
      agentMessageId,
      incrementBy: 2,
    });

    expect(await groupUsage(workspace, engineering)).toBe(5);
  });

  it("still records when the analytics index cannot be read", async () => {
    const { auth, workspace, user, agentMessageId } =
      await setupWithAgentMessage();
    const engineering = await makeLimitedGroup(
      auth,
      workspace,
      "Engineering",
      [user],
      10_000
    );
    mockConsumptionReadFailure();

    await recordGroupSharedUsage(auth, {
      user,
      agentMessageId,
      incrementBy: 3,
    });

    expect(await groupUsage(workspace, engineering)).toBe(3);
  });
});

describe("resyncGroupSharedUsageCountersFromEsUsage", () => {
  it("overwrites every limited group's counter with its analytics-index total", async () => {
    const { auth, workspace } = await setup();
    const engineering = await makeGroup(auth, workspace, "Engineering", []);
    const sales = await makeGroup(auth, workspace, "Sales", []);
    const marketing = await makeGroup(auth, workspace, "Marketing", []);
    await limit(auth, engineering, 10_000);
    await limit(auth, sales, 6_000);
    for (const group of [engineering, sales, marketing]) {
      await setCounter(workspace, group, 4_000_000);
    }
    mockConsumedBySharedUsageLimitGroup([
      { group: engineering, microCredits: 9_000_000 },
    ]);

    const result = await resyncGroupSharedUsageCountersFromEsUsage(auth);

    expect(result.isOk() && result.value.updatedGroupCount).toBe(2);
    expect(searchConsumptionAnalytics).toHaveBeenCalledWith(
      {
        bool: {
          filter: [
            { term: { workspace_id: workspace.sId } },
            {
              terms: {
                "user.shared_usage_limit_group_id": [
                  engineering.sId,
                  sales.sId,
                ],
              },
            },
            {
              range: {
                completed_at: {
                  gte: CYCLE.cycleStart.toISOString(),
                  lte: CYCLE.cycleEnd.toISOString(),
                },
              },
            },
          ],
        },
      },
      expect.objectContaining({ size: 0 })
    );
    expect(await groupUsage(workspace, engineering)).toBe(9);
    expect(await groupUsage(workspace, sales)).toBe(0);
    expect(await groupUsage(workspace, marketing)).toBe(4);
  });

  it("leaves the counters untouched when the analytics index cannot be read", async () => {
    const { auth, workspace } = await setup();
    const engineering = await makeGroup(auth, workspace, "Engineering", []);
    await limit(auth, engineering, 10_000);
    await setCounter(workspace, engineering, 4_000_000);
    mockConsumptionReadFailure();

    const result = await resyncGroupSharedUsageCountersFromEsUsage(auth);

    expect(result.isErr()).toBe(true);
    expect(await groupUsage(workspace, engineering)).toBe(4);
  });

  it("does nothing when shared usage limits are not enabled", async () => {
    const { auth, workspace } = await setup({ withFlag: false });
    const engineering = await makeGroup(auth, workspace, "Engineering", []);
    await GroupFactory.withRawSharedUsageLimit(engineering, {
      sharedUsageLimitAwuCredits: 10_000,
      sharedUsageLimitPriority: 1,
    });
    await setCounter(workspace, engineering, 4_000_000);

    const result = await resyncGroupSharedUsageCountersFromEsUsage(auth);

    expect(result.isOk() && result.value.updatedGroupCount).toBe(0);
    expect(searchConsumptionAnalytics).not.toHaveBeenCalled();
    expect(await groupUsage(workspace, engineering)).toBe(4);
  });
});

describe("isGroupSharedUsageLimitReached", () => {
  it("does not block a member whose shared usage limit group is below its limit", async () => {
    const { auth, workspace, user } = await setup();
    const engineering = await makeLimitedGroup(
      auth,
      workspace,
      "Engineering",
      [user],
      10_000
    );
    await setCounter(workspace, engineering, 9_999_000_000);

    expect(await isGroupSharedUsageLimitReached(auth, { user })).toBe(false);
  });

  it("blocks a member once their shared usage limit group reaches its limit", async () => {
    const { auth, workspace, user } = await setup();
    const engineering = await makeLimitedGroup(
      auth,
      workspace,
      "Engineering",
      [user],
      10_000
    );
    await setCounter(workspace, engineering, 10_000_000_000);

    expect(await isGroupSharedUsageLimitReached(auth, { user })).toBe(true);
  });

  it("only looks at the member's shared usage limit group, not their other limited groups", async () => {
    const { auth, workspace, user } = await setup();
    await makeLimitedGroup(auth, workspace, "Engineering", [user], 10_000);
    const sales = await makeLimitedGroup(
      auth,
      workspace,
      "Sales",
      [user],
      6_000
    );
    await setCounter(workspace, sales, 6_000_000_000);

    expect(await isGroupSharedUsageLimitReached(auth, { user })).toBe(false);
  });

  it("does not block a member without a shared usage limit group", async () => {
    const { auth, user } = await setup();

    expect(await isGroupSharedUsageLimitReached(auth, { user })).toBe(false);
  });

  it("does not block when shared usage limits are not enabled", async () => {
    const { auth, workspace, user } = await setup({ withFlag: false });
    const engineering = await makeGroup(auth, workspace, "Engineering", [user]);
    await GroupFactory.withRawSharedUsageLimit(engineering, {
      sharedUsageLimitAwuCredits: 10_000,
      sharedUsageLimitPriority: 1,
    });
    await setCounter(workspace, engineering, 10_000_000_000);

    expect(await isGroupSharedUsageLimitReached(auth, { user })).toBe(false);
  });

  it("does not block when the billing cycle is unknown", async () => {
    const { auth, workspace, user } = await setup();
    const engineering = await makeLimitedGroup(
      auth,
      workspace,
      "Engineering",
      [user],
      10_000
    );
    await setCounter(workspace, engineering, 10_000_000_000);
    vi.mocked(resolveSpendLimitCycleBounds).mockResolvedValue(null);

    expect(await isGroupSharedUsageLimitReached(auth, { user })).toBe(false);
  });
});

describe("isUserBlocked with a shared usage limit", () => {
  it("blocks a member whose shared usage limit group reached its limit, even with personal headroom left", async () => {
    const { auth, workspace, user } = await setup();
    const engineering = await makeLimitedGroup(
      auth,
      workspace,
      "Engineering",
      [user],
      10_000
    );
    const perMemberLimit = await setGroupSpendLimit(auth, {
      groupId: engineering.sId,
      limit: { kind: "limited", awuCredits: 50_000 },
      auditContext: AUDIT_CONTEXT,
    });
    if (perMemberLimit.isErr()) {
      throw perMemberLimit.error;
    }
    await setCounter(workspace, engineering, 10_000_000_000);

    expect(await isUserBlocked(auth, user)).toBe(
      "group_shared_usage_limit_reached"
    );
  });

  it("does not block a free seat in a shared usage limit group that reached its limit", async () => {
    const { auth, workspace } = await setup();
    const freeMember = await UserFactory.basic();
    await MembershipFactory.associate(workspace, freeMember, {
      role: "user",
      seatType: "free",
    });
    const engineering = await makeLimitedGroup(
      auth,
      workspace,
      "Engineering",
      [freeMember],
      10_000
    );
    await setCounter(workspace, engineering, 10_000_000_000);

    expect(await isUserBlocked(auth, freeMember)).toBeNull();
  });
});
