import {
  makeGroupLimitAwuCreditsRateLimitKeyForGroup,
  makeSpendLimitCycleWindowBounds,
} from "@app/lib/api/assistant/rate_limits";
import * as workosAudit from "@app/lib/api/audit/workos_audit";
import { setGroupLimit } from "@app/lib/api/groups/group_limit";
import { areGroupLimitsEnabled } from "@app/lib/api/groups/group_limit_eligibility";
import { recordGroupLimitUsage } from "@app/lib/api/groups/group_limit_usage";
import type { Authenticator } from "@app/lib/auth";
import { microCreditsToCredits } from "@app/lib/credits/units";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import * as cycle from "@app/lib/spend_limits/cycle";
import {
  getFixedWindowCount,
  setFixedWindowCount,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@app/lib/api/redis");

vi.mock("@app/lib/api/groups/group_limit_eligibility", () => ({
  areGroupLimitsEnabled: vi.fn(),
}));

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

const BOUNDS = makeSpendLimitCycleWindowBounds(
  new Date("2026-10-01T00:00:00Z"),
  new Date("2026-11-01T00:00:00Z")
);

beforeEach(() => {
  vi.mocked(areGroupLimitsEnabled).mockResolvedValue(true);
  vi.mocked(workosAudit.emitAuditLogEvent).mockResolvedValue(undefined);
  vi.mocked(cycle.resolveSpendLimitCycleBounds).mockResolvedValue(BOUNDS);
});

async function setup() {
  const {
    authenticator: auth,
    workspace,
    user,
  } = await createResourceTest({
    role: "admin",
    plan: "creditPriced",
  });
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

async function makeLimitedGroup(
  auth: Authenticator,
  workspace: LightWorkspaceType,
  name: string,
  members: UserResource[],
  awuCredits: number
): Promise<GroupResource> {
  const group = await GroupFactory.regularManual(workspace, name);
  const added = await GroupFactory.withMembers(auth, group, members);
  if (added.isErr()) {
    throw added.error;
  }
  await setLimit(auth, group, awuCredits);
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

describe("recordGroupLimitUsage", () => {
  it("records the credits to the member's limit group and stores it on the message", async () => {
    const { auth, workspace, user, agentMessageId } = await setup();
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
    const { auth, workspace, user, agentMessageId } = await setup();
    const engineering = await makeLimitedGroup(
      auth,
      workspace,
      "Engineering",
      [user],
      10_000
    );
    await recordGroupLimitUsage(auth, { user, agentMessageId, incrementBy: 3 });
    await setLimit(auth, engineering, null);
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
    const { auth, workspace, user, agentMessageId } = await setup();
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
    const { auth, workspace, user, agentMessageId } = await setup();

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
    const { auth, workspace, user, agentMessageId } = await setup();
    const engineering = await makeLimitedGroup(
      auth,
      workspace,
      "Engineering",
      [user],
      10_000
    );
    vi.mocked(areGroupLimitsEnabled).mockResolvedValue(false);

    await recordGroupLimitUsage(auth, { user, agentMessageId, incrementBy: 3 });

    expect(await groupUsage(workspace, engineering)).toBe(0);
    expect(await storedLimitGroupModelId(auth, agentMessageId)).toBeNull();
  });

  it("stores the group but writes no counter when the billing cycle is unknown", async () => {
    const { auth, workspace, user, agentMessageId } = await setup();
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
    const { auth, workspace, user, agentMessageId } = await setup();
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
