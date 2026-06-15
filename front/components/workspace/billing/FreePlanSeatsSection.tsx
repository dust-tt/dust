import { useMembers } from "@app/lib/swr/memberships";
import type { SubscriptionType } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import { Icon, InfoSquare, Spinner } from "@dust-tt/sparkle";

interface FreePlanSeatsSectionProps {
  owner: LightWorkspaceType;
  subscription: SubscriptionType;
}

export function FreePlanSeatsSection({
  owner,
  subscription,
}: FreePlanSeatsSectionProps) {
  const { total, isMembersLoading } = useMembers({ workspaceId: owner.sId });
  const maxSeats = subscription.plan.limits.users.maxUsers;

  if (maxSeats <= 0) {
    return null;
  }

  if (isMembersLoading) {
    return (
      <div className="flex items-center justify-center rounded-2xl bg-muted-background p-4 dark:bg-muted-background-night">
        <Spinner />
      </div>
    );
  }

  const isAtCapacity = total >= maxSeats;
  const fillPercent =
    maxSeats > 0 ? Math.min((total / maxSeats) * 100, 100) : 0;

  const heading = isAtCapacity
    ? `You've used all ${maxSeats} free seats`
    : `${total} of ${maxSeats} free seats used`;

  const description = isAtCapacity
    ? "You can't invite anyone else on the free plan. Upgrade a member to a Pro or Max seat on the Members page to add more, the cap lifts instantly."
    : `Free workspaces include ${maxSeats} members. Upgrade a member to a Pro or Max seat anytime to go beyond the cap and unlock paid models.`;

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted-background p-4 dark:bg-muted-background-night">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Icon visual={InfoSquare} size="sm" />
          <span className="text-base font-semibold text-foreground dark:text-foreground-night">
            {heading}
          </span>
        </div>
        <p className="text-sm text-foreground dark:text-foreground-night">
          {description}
        </p>
      </div>

      <div className="flex h-1 w-full gap-0.5">
        {fillPercent > 0 && (
          <div
            className="h-full shrink-0 rounded-lg bg-foreground dark:bg-foreground-night"
            style={{ width: `${fillPercent}%` }}
          />
        )}
        {!isAtCapacity && (
          <div className="h-full min-w-0 flex-1 rounded-lg bg-black/[0.08] dark:bg-white/[0.08]" />
        )}
      </div>
    </div>
  );
}
