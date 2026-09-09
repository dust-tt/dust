import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import type { UserSpendLimit } from "@app/types/api/users/spend_limit";
import {
  MAX_USER_SPEND_LIMIT_AWU_CREDITS,
  MIN_USER_SPEND_LIMIT_AWU_CREDITS,
} from "@app/types/api/users/spend_limit";
import {
  MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
  MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
} from "@app/types/credits";
import type { GroupType } from "@app/types/groups";

export type GroupRow = {
  groupId: string;
  name: string;
  poolCapAwuCredits: number | null;
  memberCount: number;
  isHighest: boolean;
  onClick?: () => void;
};

export function toSpendLimit(awuCredits: number | null): UserSpendLimit {
  return awuCredits === null
    ? { kind: "unlimited" }
    : { kind: "limited", awuCredits };
}

type ParsedCredits<T> =
  | { ok: true; awuCredits: T }
  | { ok: false; message: string };

function outOfRangeMessage(min: number, max: number): string {
  return `Enter a whole number of credits between ${min.toLocaleString("en-US")} and ${max.toLocaleString("en-US")}.`;
}

// An empty input parses to null so callers decide what "no value" means.
function parseBoundedCreditsInput(
  raw: string,
  min: number,
  max: number
): ParsedCredits<number | null> {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, awuCredits: null };
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return { ok: false, message: outOfRangeMessage(min, max) };
  }
  return { ok: true, awuCredits: parsed };
}

export function parseCreditsInput(raw: string): ParsedCredits<number | null> {
  return parseBoundedCreditsInput(
    raw,
    MIN_USER_SPEND_LIMIT_AWU_CREDITS,
    MAX_USER_SPEND_LIMIT_AWU_CREDITS
  );
}

// The workspace default has no "unlimited" state: it is always a concrete
// number, so an empty input is rejected rather than coerced to 0 (which would
// mean "no pool access").
export function parseDefaultLimitInput(raw: string): ParsedCredits<number> {
  const result = parseBoundedCreditsInput(
    raw,
    MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
    MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS
  );
  if (!result.ok) {
    return result;
  }
  if (result.awuCredits === null) {
    return {
      ok: false,
      message: outOfRangeMessage(
        MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
        MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS
      ),
    };
  }
  return { ok: true, awuCredits: result.awuCredits };
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
