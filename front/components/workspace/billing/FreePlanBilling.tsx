import { FreePlanSeatsSection } from "@app/components/workspace/billing/FreePlanSeatsSection";
import { FreePlanUpgradeSection } from "@app/components/workspace/billing/FreePlanUpgradeSection";
import { SubscriptionStatusChip } from "@app/components/workspace/billing/SubscriptionStatusChip";
import type { SubscriptionType } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import { NewButton } from "@dust-tt/sparkle";

interface FreePlanBillingProps {
  owner: LightWorkspaceType;
  subscription: SubscriptionType;
}

export function FreePlanBilling({ owner, subscription }: FreePlanBillingProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-base font-semibold text-foreground">
          Business
        </span>
        <SubscriptionStatusChip />
      </div>
      <FreePlanSeatsSection owner={owner} subscription={subscription} />
      <FreePlanUpgradeSection
        action={
          <NewButton
            label="Upgrade a member"
            size="sm"
            variant="highlight"
            href={`/w/${owner.sId}/usage`}
          />
        }
      />
    </div>
  );
}
