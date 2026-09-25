import type { User } from "./types";
import { mockUsers } from "./users";

export type GroupLimitPlan = "pooled" | "seats";
export type GroupLimitSeat = "pro" | "max";

export const SEAT_ALLOWANCES: Record<GroupLimitSeat, number> = {
  pro: 1_000,
  max: 3_000,
};

export const BILLING_CYCLE_RESET_LABEL = "Oct 1";
export const NO_LIMIT_GROUP_KEY = "none";

export interface UsageGroup {
  id: string;
  name: string;
  kind: "provisioned" | "manual";
  perMemberLimit: number | null;
  groupLimit: number | null;
}

export interface UsageGroupMembership {
  userId: string;
  groupId: string;
  joinedAt: string;
}

export interface UsageMember {
  userId: string;
  personalLimit: number | null;
  explicitLimitGroupId: string | null;
  seat: GroupLimitSeat;
  seatUsed: number;
  spendByGroup: Record<string, number>;
}

export interface GroupLimitsState {
  workspaceDefaultLimit: number;
  groups: UsageGroup[];
  memberships: UsageGroupMembership[];
  members: Record<string, UsageMember>;
}

export type LimitGroupSource = "explicit" | "default";

export interface ResolvedLimitGroup {
  group: UsageGroup;
  source: LimitGroupSource;
}

export type PerMemberLimitSource =
  | { kind: "personal" }
  | { kind: "limitGroup"; group: UsageGroup }
  | { kind: "limitGroupDefault"; group: UsageGroup }
  | { kind: "highestGroup"; group: UsageGroup }
  | { kind: "workspaceDefault" };

export interface PerMemberLimit {
  value: number;
  source: PerMemberLimitSource;
}

export type BlockedReason =
  | { kind: "groupLimit"; group: UsageGroup }
  | { kind: "memberLimit" };

const GROUPS: UsageGroup[] = [
  {
    id: "eng",
    name: "Engineering",
    kind: "provisioned",
    perMemberLimit: 1_000,
    groupLimit: 10_000,
  },
  {
    id: "sales",
    name: "Sales",
    kind: "provisioned",
    perMemberLimit: 600,
    groupLimit: null,
  },
  {
    id: "mkt",
    name: "Marketing",
    kind: "provisioned",
    perMemberLimit: 800,
    groupLimit: 5_000,
  },
  {
    id: "lead",
    name: "Leadership",
    kind: "manual",
    perMemberLimit: 2_000,
    groupLimit: null,
  },
  {
    id: "support",
    name: "Support",
    kind: "provisioned",
    perMemberLimit: null,
    groupLimit: 3_000,
  },
  {
    id: "emea",
    name: "EMEA",
    kind: "manual",
    perMemberLimit: null,
    groupLimit: null,
  },
];

const MEMBERSHIPS: Array<[string, string, string]> = [
  ["1", "eng", "2024-02-01"],
  ["2", "eng", "2024-03-12"],
  ["3", "eng", "2024-04-02"],
  ["4", "eng", "2024-05-20"],
  ["5", "eng", "2024-06-03"],
  ["6", "eng", "2024-06-17"],
  ["7", "eng", "2024-09-09"],
  ["8", "eng", "2025-01-06"],
  ["9", "eng", "2025-02-10"],
  ["10", "eng", "2024-08-01"],
  ["8", "support", "2025-03-01"],
  ["9", "support", "2024-10-14"],
  ["11", "support", "2024-07-01"],
  ["12", "support", "2024-07-15"],
  ["13", "support", "2025-03-03"],
  ["3", "mkt", "2025-01-20"],
  ["10", "mkt", "2025-04-07"],
  ["14", "mkt", "2024-05-06"],
  ["15", "mkt", "2024-06-10"],
  ["16", "mkt", "2024-09-23"],
  ["17", "mkt", "2025-02-17"],
  ["18", "mkt", "2025-05-12"],
  ["5", "sales", "2025-03-24"],
  ["6", "sales", "2025-04-14"],
  ["14", "sales", "2024-08-19"],
  ["19", "sales", "2024-03-04"],
  ["20", "sales", "2024-04-15"],
  ["21", "sales", "2024-10-07"],
  ["22", "sales", "2025-01-13"],
  ["23", "sales", "2025-06-02"],
  ["1", "lead", "2024-02-01"],
  ["14", "lead", "2025-02-03"],
  ["19", "lead", "2024-03-04"],
  ["24", "lead", "2024-01-15"],
  ["20", "emea", "2024-04-15"],
  ["21", "emea", "2024-10-07"],
  ["22", "emea", "2025-01-13"],
  ["23", "emea", "2025-06-02"],
  ["24", "emea", "2024-01-15"],
  ["25", "emea", "2025-07-01"],
];

const MEMBER_SEEDS: Array<
  [
    userId: string,
    spendByGroup: Record<string, number>,
    options?: {
      personalLimit?: number;
      explicitLimitGroupId?: string;
      seat?: GroupLimitSeat;
      seatUsed?: number;
    },
  ]
> = [
  ["1", { eng: 2_450 }, { personalLimit: 3_000, seat: "max" }],
  ["2", { eng: 980 }],
  ["3", { eng: 640 }],
  ["4", { eng: 1_000 }],
  ["5", { eng: 720 }],
  ["6", { eng: 910 }],
  ["7", { eng: 820 }],
  ["8", { eng: 300, support: 180 }, { explicitLimitGroupId: "support" }],
  ["9", { support: 470 }],
  ["10", { eng: 300, mkt: 450 }, { explicitLimitGroupId: "mkt" }],
  ["11", { support: 500 }],
  ["12", { support: 1_690 }, { personalLimit: 2_000 }],
  ["13", {}, { seatUsed: 640 }],
  ["14", { mkt: 720 }],
  ["15", { mkt: 610 }],
  ["16", { mkt: 380 }],
  ["17", { mkt: 800 }],
  ["18", { mkt: 260 }],
  ["19", { none: 1_340 }],
  ["20", { none: 410 }],
  ["21", { none: 220 }],
  ["22", { none: 590 }],
  ["23", {}, { seatUsed: 310 }],
  ["24", { none: 1_610 }],
  ["25", { none: 90 }],
];

export function createInitialGroupLimitsState(): GroupLimitsState {
  const members: Record<string, UsageMember> = {};
  for (const [userId, spendByGroup, options = {}] of MEMBER_SEEDS) {
    const seat = options.seat ?? "pro";
    const poolSpend = Object.values(spendByGroup).reduce((a, b) => a + b, 0);
    members[userId] = {
      userId,
      personalLimit: options.personalLimit ?? null,
      explicitLimitGroupId: options.explicitLimitGroupId ?? null,
      seat,
      seatUsed: options.seatUsed ?? (poolSpend > 0 ? SEAT_ALLOWANCES[seat] : 0),
      spendByGroup: { ...spendByGroup },
    };
  }
  return {
    workspaceDefaultLimit: 500,
    groups: GROUPS.map((g) => ({ ...g })),
    memberships: MEMBERSHIPS.map(([userId, groupId, joinedAt]) => ({
      userId,
      groupId,
      joinedAt,
    })),
    members,
  };
}

export function formatCreditAmount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function getGroupLimitUser(userId: string): User {
  const user = mockUsers.find((u) => u.id === userId);
  if (!user) {
    throw new Error(`Unknown user ${userId}`);
  }
  return user;
}

export function getGroup(state: GroupLimitsState, groupId: string): UsageGroup {
  const group = state.groups.find((g) => g.id === groupId);
  if (!group) {
    throw new Error(`Unknown group ${groupId}`);
  }
  return group;
}

export function getMemberIds(state: GroupLimitsState): string[] {
  return Object.keys(state.members).sort((a, b) => Number(a) - Number(b));
}

export function getGroupMemberIds(
  state: GroupLimitsState,
  groupId: string
): string[] {
  return state.memberships
    .filter((m) => m.groupId === groupId)
    .map((m) => m.userId);
}

export function getMemberGroups(
  state: GroupLimitsState,
  userId: string
): UsageGroup[] {
  return state.memberships
    .filter((m) => m.userId === userId)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
    .map((m) => getGroup(state, m.groupId));
}

export function getMemberLimitedGroups(
  state: GroupLimitsState,
  userId: string
): UsageGroup[] {
  return getMemberGroups(state, userId).filter((g) => g.groupLimit !== null);
}

export function getJoinedAt(
  state: GroupLimitsState,
  userId: string,
  groupId: string
): string | null {
  return (
    state.memberships.find((m) => m.userId === userId && m.groupId === groupId)
      ?.joinedAt ?? null
  );
}

export function resolveLimitGroup(
  state: GroupLimitsState,
  userId: string
): ResolvedLimitGroup | null {
  const limited = getMemberLimitedGroups(state, userId);
  const explicitId = state.members[userId].explicitLimitGroupId;
  const explicit = limited.find((g) => g.id === explicitId);
  if (explicit) {
    return { group: explicit, source: "explicit" };
  }
  if (limited.length > 0) {
    return { group: limited[0], source: "default" };
  }
  return null;
}

export function getPerMemberLimit(
  state: GroupLimitsState,
  userId: string
): PerMemberLimit {
  const member = state.members[userId];
  if (member.personalLimit !== null) {
    return { value: member.personalLimit, source: { kind: "personal" } };
  }
  const limitGroup = resolveLimitGroup(state, userId);
  if (limitGroup) {
    if (limitGroup.group.perMemberLimit !== null) {
      return {
        value: limitGroup.group.perMemberLimit,
        source: { kind: "limitGroup", group: limitGroup.group },
      };
    }
    return {
      value: state.workspaceDefaultLimit,
      source: { kind: "limitGroupDefault", group: limitGroup.group },
    };
  }
  const withLimit = getMemberGroups(state, userId).filter(
    (g) => g.perMemberLimit !== null
  );
  if (withLimit.length > 0) {
    const highest = withLimit.reduce((a, b) =>
      (b.perMemberLimit ?? 0) > (a.perMemberLimit ?? 0) ? b : a
    );
    return {
      value: highest.perMemberLimit ?? 0,
      source: { kind: "highestGroup", group: highest },
    };
  }
  return {
    value: state.workspaceDefaultLimit,
    source: { kind: "workspaceDefault" },
  };
}

export function describePerMemberLimitSource(source: PerMemberLimitSource) {
  switch (source.kind) {
    case "personal":
      return "Personal limit";
    case "limitGroup":
      return `Limit per member of ${source.group.name} (limit group)`;
    case "limitGroupDefault":
      return `Workspace default (${source.group.name} has no limit per member)`;
    case "highestGroup":
      return `Highest limit per member across groups (${source.group.name})`;
    case "workspaceDefault":
      return "Workspace default";
  }
}

export function getMemberPoolSpend(
  state: GroupLimitsState,
  userId: string
): number {
  return Object.values(state.members[userId].spendByGroup).reduce(
    (a, b) => a + b,
    0
  );
}

export function getGroupUsage(
  state: GroupLimitsState,
  groupId: string
): number {
  return Object.values(state.members).reduce(
    (sum, m) => sum + (m.spendByGroup[groupId] ?? 0),
    0
  );
}

export function getGroupMembersPoolSpend(
  state: GroupLimitsState,
  groupId: string
): number {
  return getGroupMemberIds(state, groupId).reduce(
    (sum, userId) => sum + getMemberPoolSpend(state, userId),
    0
  );
}

export function getDrawingMemberIds(
  state: GroupLimitsState,
  groupId: string
): string[] {
  return getMemberIds(state).filter(
    (userId) => resolveLimitGroup(state, userId)?.group.id === groupId
  );
}

export function getSeatAllowance(
  member: UsageMember,
  plan: GroupLimitPlan
): number {
  return plan === "seats" ? SEAT_ALLOWANCES[member.seat] : 0;
}

export function getSeatAllowanceLeft(
  state: GroupLimitsState,
  userId: string,
  plan: GroupLimitPlan
): number {
  const member = state.members[userId];
  return Math.max(0, getSeatAllowance(member, plan) - member.seatUsed);
}

export function getBlockedReason(
  state: GroupLimitsState,
  userId: string,
  plan: GroupLimitPlan
): BlockedReason | null {
  if (getSeatAllowanceLeft(state, userId, plan) > 0) {
    return null;
  }
  const limitGroup = resolveLimitGroup(state, userId);
  if (
    limitGroup &&
    limitGroup.group.groupLimit !== null &&
    getGroupUsage(state, limitGroup.group.id) >= limitGroup.group.groupLimit
  ) {
    return { kind: "groupLimit", group: limitGroup.group };
  }
  if (
    getMemberPoolSpend(state, userId) >= getPerMemberLimit(state, userId).value
  ) {
    return { kind: "memberLimit" };
  }
  return null;
}

function updateGroup(
  state: GroupLimitsState,
  groupId: string,
  patch: Partial<UsageGroup>
): GroupLimitsState {
  return {
    ...state,
    groups: state.groups.map((g) =>
      g.id === groupId ? { ...g, ...patch } : g
    ),
  };
}

function updateMember(
  state: GroupLimitsState,
  userId: string,
  patch: Partial<UsageMember>
): GroupLimitsState {
  return {
    ...state,
    members: {
      ...state.members,
      [userId]: { ...state.members[userId], ...patch },
    },
  };
}

export function setPerMemberLimit(
  state: GroupLimitsState,
  groupId: string,
  perMemberLimit: number | null
): GroupLimitsState {
  return updateGroup(state, groupId, { perMemberLimit });
}

// `assignments` maps each member who already drew from another group to the
// group they will draw from once the limit is set.
export function addGroupLimit(
  state: GroupLimitsState,
  groupId: string,
  groupLimit: number,
  assignments: Record<string, string>
): GroupLimitsState {
  let next = updateGroup(state, groupId, { groupLimit });
  for (const [userId, limitGroupId] of Object.entries(assignments)) {
    next = updateMember(next, userId, { explicitLimitGroupId: limitGroupId });
  }
  return next;
}

export function editGroupLimit(
  state: GroupLimitsState,
  groupId: string,
  groupLimit: number
): GroupLimitsState {
  return updateGroup(state, groupId, { groupLimit });
}

export function removeGroupLimit(
  state: GroupLimitsState,
  groupId: string
): GroupLimitsState {
  let next = updateGroup(state, groupId, { groupLimit: null });
  for (const member of Object.values(next.members)) {
    if (member.explicitLimitGroupId === groupId) {
      next = updateMember(next, member.userId, { explicitLimitGroupId: null });
    }
  }
  return next;
}

// `null` puts the member back on the default (the limited group joined first).
export function setLimitGroup(
  state: GroupLimitsState,
  userId: string,
  limitGroupId: string | null
): GroupLimitsState {
  return updateMember(state, userId, { explicitLimitGroupId: limitGroupId });
}

export function setPersonalLimit(
  state: GroupLimitsState,
  userId: string,
  personalLimit: number | null
): GroupLimitsState {
  return updateMember(state, userId, { personalLimit });
}

export function changeSeat(
  state: GroupLimitsState,
  userId: string,
  seat: GroupLimitSeat
): GroupLimitsState {
  return updateMember(state, userId, { seat });
}

// Adds or removes spend in `groupId`, spread across the members drawing from
// it in proportion to their headroom (or current spend), so the group lands on
// `target`. Only used by the scenario presets.
export function setGroupUsageForDemo(
  state: GroupLimitsState,
  groupId: string,
  target: number
): GroupLimitsState {
  const drawers = getDrawingMemberIds(state, groupId);
  const delta = target - getGroupUsage(state, groupId);
  if (drawers.length === 0 || delta === 0) {
    return state;
  }
  const weights = drawers.map((userId) =>
    delta > 0
      ? Math.max(
          0,
          getPerMemberLimit(state, userId).value -
            getMemberPoolSpend(state, userId)
        )
      : (state.members[userId].spendByGroup[groupId] ?? 0)
  );
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const shareOf = (i: number) =>
    weightSum > 0 ? weights[i] / weightSum : 1 / drawers.length;
  let remaining = delta;
  let next = state;
  drawers.forEach((userId, i) => {
    const member = next.members[userId];
    const current = member.spendByGroup[groupId] ?? 0;
    const share =
      i === drawers.length - 1 ? remaining : Math.round(delta * shareOf(i));
    const change = Math.max(-current, share);
    remaining -= change;
    next = updateMember(next, userId, {
      seatUsed:
        current + change > 0 ? SEAT_ALLOWANCES[member.seat] : member.seatUsed,
      spendByGroup: { ...member.spendByGroup, [groupId]: current + change },
    });
  });
  return next;
}

export interface MemberChange {
  userId: string;
  limitBefore: number;
  limitAfter: number;
  limitGroupBefore: UsageGroup | null;
  limitGroupAfter: UsageGroup | null;
  becomesBlocked: boolean;
}

export function diffMembers(
  before: GroupLimitsState,
  after: GroupLimitsState,
  plan: GroupLimitPlan,
  userIds: string[] = getMemberIds(before)
): MemberChange[] {
  return userIds.map((userId) => ({
    userId,
    limitBefore: getPerMemberLimit(before, userId).value,
    limitAfter: getPerMemberLimit(after, userId).value,
    limitGroupBefore: resolveLimitGroup(before, userId)?.group ?? null,
    limitGroupAfter: resolveLimitGroup(after, userId)?.group ?? null,
    becomesBlocked:
      getBlockedReason(before, userId, plan) === null &&
      getBlockedReason(after, userId, plan) !== null,
  }));
}
