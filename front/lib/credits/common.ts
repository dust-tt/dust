import { MembershipResource } from "@app/lib/resources/membership_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";

// 5 days
const USER_COUNT_CUTOFF_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * This function counts "good" users, for credit-related logic depending on the
 * number of users.
 *
 * The first goal is to make it not worth it for people to bump up / down the number of
 * users before billing cycle renewal. Why 5 days ? At the current price of $30
 * / month, pro-rated bump up from 5 days ago would be 5$.
 *
 * At minimum, we always count 1 user.
 */

export async function countEligibleUsersForCredits(
  workspace: Parameters<typeof renderLightWorkspaceType>[0]["workspace"]
): Promise<number> {
  const cutoffDate = new Date(Date.now() - USER_COUNT_CUTOFF_MS);
  const count = await MembershipResource.getMembersCountForWorkspace({
    workspace: renderLightWorkspaceType({ workspace }),
    activeOnly: true,
    membershipSpan: { fromDate: cutoffDate, toDate: cutoffDate },
  });
  return Math.max(1, count);
}
