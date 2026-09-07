import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import {
  MAX_USER_SPEND_LIMIT_AWU_CREDITS,
  MIN_USER_SPEND_LIMIT_AWU_CREDITS,
} from "@app/types/api/users/spend_limit";
import type { GroupType } from "@app/types/groups";

export type GroupRow = {
  groupId: string;
  name: string;
  poolCapAwuCredits: number | null;
  memberCount: number;
  isHighest: boolean;
  onClick?: () => void;
};

export function parseCreditsInput(
  raw: string
): { ok: true; awuCredits: number | null } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, awuCredits: null };
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < MIN_USER_SPEND_LIMIT_AWU_CREDITS) {
    return {
      ok: false,
      message: `Enter a whole number of credits between ${MIN_USER_SPEND_LIMIT_AWU_CREDITS.toLocaleString("en-US")} and ${MAX_USER_SPEND_LIMIT_AWU_CREDITS.toLocaleString("en-US")}.`,
    };
  }
  if (parsed > MAX_USER_SPEND_LIMIT_AWU_CREDITS) {
    return {
      ok: false,
      message: `Credits cannot exceed ${MAX_USER_SPEND_LIMIT_AWU_CREDITS.toLocaleString("en-US")}.`,
    };
  }
  return { ok: true, awuCredits: parsed };
}

export function groupRowsForMember(
  member: MemberUsageType | null,
  groups: GroupType[]
): GroupRow[] {
  const hasPersonalOverride = member?.spendLimitSource === "override";

  const groupsByName = new Map(groups.map((g) => [g.name, g]));
  const memberGroups: GroupType[] = [];
  for (const groupName of member?.groups ?? []) {
    const group = groupsByName.get(groupName);
    if (group) {
      memberGroups.push(group);
    }
  }

  // When there's no personal override, the highest group cap the member is
  // part of is the one currently granting their extra credits.
  let highest: GroupType | null = null;
  for (const g of memberGroups) {
    if (
      g.poolCapAwuCredits !== null &&
      g.poolCapAwuCredits > (highest?.poolCapAwuCredits ?? -1)
    ) {
      highest = g;
    }
  }

  return memberGroups.map((g) => ({
    groupId: g.sId,
    name: g.name,
    poolCapAwuCredits: g.poolCapAwuCredits,
    memberCount: g.memberCount,
    isHighest: !hasPersonalOverride && g.sId === highest?.sId,
  }));
}
