import { resolveMatchingMemberUserIds } from "@app/lib/api/credits/members_usage";
import type { Authenticator } from "@app/lib/auth";
import { UserResource } from "@app/lib/resources/user_resource";
import type { MembershipSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

export type BulkSpendLimitFilter = {
  seatType?: MembershipSeatType;
  groupId?: string;
  search?: string;
};

// Either an explicit set of member sIds, or "everything matching the current
// filter, minus a few" (resolved server-side).
export type BulkSpendLimitSelection =
  | { mode: "ids"; userIds: string[] }
  | { mode: "all"; filter: BulkSpendLimitFilter; excludeUserIds: string[] };

export async function resolveBulkSpendLimitUserIds(
  auth: Authenticator,
  selection: BulkSpendLimitSelection
): Promise<Result<string[], Error>> {
  if (selection.mode === "ids") {
    const uniqueIds = [...new Set(selection.userIds)];
    if (uniqueIds.length === 0) {
      return new Ok([]);
    }
    const result = await UserResource.searchAllUsers(auth, {
      searchTerm: "",
      restrictToUserIds: uniqueIds,
    });
    if (result.isErr()) {
      return result;
    }
    return new Ok(result.value.users.map((u) => u.sId));
  }

  const matchingRes = await resolveMatchingMemberUserIds({
    auth,
    filter: selection.filter,
  });
  if (matchingRes.isErr()) {
    return matchingRes;
  }
  const excluded = new Set(selection.excludeUserIds);
  return new Ok(matchingRes.value.filter((userId) => !excluded.has(userId)));
}
