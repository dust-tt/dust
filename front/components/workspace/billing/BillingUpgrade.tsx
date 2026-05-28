import config from "@app/lib/api/config";
import {
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
  CREDIT_PRICED_FREE_PLAN_CODE,
  isEntreprisePlanPrefix,
} from "@app/lib/plans/plan_codes";
import type { SubscriptionType } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import { Button } from "@dust-tt/sparkle";

interface BillingUpgradeProps {
  owner: LightWorkspaceType;
  subscription: SubscriptionType;
}

export function BillingUpgrade({ owner, subscription }: BillingUpgradeProps) {
  const { code } = subscription.plan;

  if (subscription.endDate !== null || isEntreprisePlanPrefix(code)) {
    return null;
  }

  const isFreePlan = code !== CREDIT_PRICED_FREE_PLAN_CODE;
  const isBusinessPlan = code !== CREDIT_PRICED_BUSINESS_PLAN_CODE;

  // For now we show the component only for the business plan (to offer to contact sales) as the
  // upgrade path (seats-focused vs subscription-focused) is still being discussed.
  if (!isBusinessPlan) {
    return null;
  }

  const planName = isFreePlan ? "Business" : "Enterprise";
  const features = isFreePlan
    ? ["Up to 100 users", "Mix Pro and Max seats"]
    : [
        "Unlimited number of users",
        "Workspace-pooled credits & volume pricing",
        "Customer support",
      ];
  const buttonProps = isFreePlan
    ? {
        label: "Add seats",
        href: `/w/${owner.sId}/usage`,
        variant: "highlight" as const,
      }
    : {
        label: "Contact sales",
        href: `${config.getStaticWebsiteUrl()}/home/contact`,
        target: "_blank",
        variant: "outline" as const,
      };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-foreground dark:text-foreground-night">
        Upgrade your workspace
      </h2>
      <div className="flex flex-col gap-4 rounded-lg bg-muted-background p-4 dark:bg-muted-background-night">
        <div className="flex items-center justify-between gap-4">
          <div className="truncate text-base font-semibold text-foreground dark:text-foreground-night">
            {planName}
          </div>
          <Button size="sm" {...buttonProps} />
        </div>
        <div className="flex flex-col gap-2 text-xs text-muted-foreground dark:text-muted-foreground-night">
          {features.map((feature) => (
            <div key={feature}>{feature}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
