import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import type { GroupType } from "@app/types/groups";
import { removeNulls } from "@app/types/shared/utils/general";

export const MIN_AWU_CREDITS = 0;
export const MAX_AWU_CREDITS = 2_000_000;

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
  if (!Number.isInteger(parsed) || parsed < MIN_AWU_CREDITS) {
    return {
      ok: false,
      message: `Enter a whole number of credits between ${MIN_AWU_CREDITS.toLocaleString("en-US")} and ${MAX_AWU_CREDITS.toLocaleString("en-US")}.`,
    };
  }
  if (parsed > MAX_AWU_CREDITS) {
    return {
      ok: false,
      message: `Credits cannot exceed ${MAX_AWU_CREDITS.toLocaleString("en-US")}.`,
    };
  }
  return { ok: true, awuCredits: parsed };
}

export function groupRowsForMember(
  member: MemberUsageType | null,
  groups: GroupType[]
): GroupRow[] {
  const hasPersonalOverride = member?.spendLimitSource === "override";
  const memberGroups: GroupType[] = removeNulls(
    (member?.groups ?? []).map((groupName) =>
      groups.find((g) => g.name === groupName)
    )
  );

  // When there's no personal override, the highest group cap the member is
  // part of is the one currently granting their extra credits.
  const highestGroupId = memberGroups.reduce<string | null>((highestSId, g) => {
    if (g.poolCapAwuCredits === null) {
      return highestSId;
    }
    const highest = memberGroups.find((h) => h.sId === highestSId);
    if (!highest || g.poolCapAwuCredits > (highest.poolCapAwuCredits ?? -1)) {
      return g.sId;
    }
    return highestSId;
  }, null);

  return memberGroups.map((g) => ({
    groupId: g.sId,
    name: g.name,
    poolCapAwuCredits: g.poolCapAwuCredits,
    memberCount: g.memberCount,
    isHighest: !hasPersonalOverride && g.sId === highestGroupId,
  }));
}
