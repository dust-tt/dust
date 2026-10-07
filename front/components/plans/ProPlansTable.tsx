import type { PriceTableDisplay } from "@app/components/plans/PlansTables";
import {
  BusinessPriceTable,
  ProPriceTable,
} from "@app/components/plans/PlansTables";
import { classNames } from "@app/lib/utils";
import type { BillingPeriod, PlanType } from "@app/types/plan";
import type { WorkspaceType } from "@app/types/user";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

export function ProPlansTable({
  owner,
  size = "sm",
  className = "",
  plan,
  display,
  setBillingPeriod,
}: {
  owner: WorkspaceType;
  size?: "sm" | "xs";
  className?: string;
  plan?: PlanType;
  display: PriceTableDisplay;
  setBillingPeriod: (billingPeriod: BillingPeriod) => void;
}) {
  const { t } = useLingui();
  const isBusiness = owner.metadata?.isBusiness ?? false;

  if (isBusiness) {
    return (
      <BusinessPriceTable
        owner={owner}
        display={display}
        size={size}
        plan={plan}
        billingPeriod="monthly"
      />
    );
  }

  return (
    <div className={classNames("w-full sm:px-0", className)}>
      <Tabs
        defaultValue="monthly"
        onValueChange={(value) => setBillingPeriod(value as BillingPeriod)}
      >
        <TabsList>
          <TabsTrigger value="monthly" label={t`Monthly Billing`} />
          <TabsTrigger value="yearly" label={t`Yearly Billing`} />
        </TabsList>
        <div className="mt-8">
          <TabsContent value="monthly">
            <ProPriceTable
              owner={owner}
              display={display}
              size={size}
              plan={plan}
              billingPeriod="monthly"
            />
          </TabsContent>
          <TabsContent value="yearly">
            <ProPriceTable
              owner={owner}
              display={display}
              size={size}
              plan={plan}
              billingPeriod="yearly"
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
