import type { LightWorkspaceType } from "@dust-tt/types";
import { cacheWithRedis } from "@dust-tt/types";
import type Stripe from "stripe";

import { Workspace } from "@app/lib/models/workspace";
import { updateStripeQuantityForSubscriptionItem } from "@app/lib/plans/stripe";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";

export async function countActiveSeatsInWorkspace(
  workspaceId: string
): Promise<number> {
  const workspace = await Workspace.findOne({
    where: {
      sId: workspaceId,
    },
  });
  if (!workspace) {
    throw new Error(`Workspace not found for sId: ${workspaceId}`);
  }

  return MembershipResource.getMembersCountForWorkspace({
    workspace: renderLightWorkspaceType({ workspace }),
    activeOnly: true,
  });
}

export const countActiveSeatsInWorkspaceCached = cacheWithRedis(
  countActiveSeatsInWorkspace,
  (workspaceId) => {
    return `count-active-seats-in-workspace:${workspaceId}`;
  },
  60 * 10 * 1000 // 10 minutes
);

export async function reportActiveSeats(
  stripeSubscriptionItem: Stripe.SubscriptionItem,
  workspace: LightWorkspaceType
): Promise<void> {
  const activeSeats = await countActiveSeatsInWorkspace(workspace.sId);

  await updateStripeQuantityForSubscriptionItem(
    stripeSubscriptionItem,
    activeSeats
  );
}
