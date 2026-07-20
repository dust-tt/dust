import { resolveMatchingMemberUserIds } from "@app/lib/api/credits/members_usage";
import type { Authenticator } from "@app/lib/auth";
import { UserResource } from "@app/lib/resources/user_resource";
import { MEMBERSHIP_SEAT_TYPES } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { z } from "zod";

const BulkMemberSelectionFilterSchema = z.object({
  seatType: z.enum(MEMBERSHIP_SEAT_TYPES).optional(),
  groupId: z.string().optional(),
  search: z.string().optional(),
});

// Descriptor of a cross-page member selection in the usage members table:
// either an explicit list of user sIds, or "all members matching the current
// filter" minus explicit exclusions. Shared by the bulk member actions
// (spend-limit and seat-type updates).
export const BulkMemberSelectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("ids"), userIds: z.array(z.string()).min(1) }),
  z.object({
    mode: z.literal("all"),
    filter: BulkMemberSelectionFilterSchema,
    excludeUserIds: z.array(z.string()),
  }),
]);

export type BulkMemberSelection = z.infer<typeof BulkMemberSelectionSchema>;

export async function resolveBulkMemberSelectionUserIds(
  auth: Authenticator,
  selection: BulkMemberSelection
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
