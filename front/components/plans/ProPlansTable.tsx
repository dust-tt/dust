import { Tabs, TabsContent, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import React from "react";

import type { PriceTableDisplay } from "@app/components/plans/PlansTables";
import { ProPriceTable } from "@app/components/plans/PlansTables";
import { classNames } from "@app/lib/utils";
import type { BillingPeriod, PlanType, WorkspaceType } from "@app/types";

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
  const isBusiness = owner.metadata?.isBusiness ?? false;

  if (isBusiness) {
    return (
      <ProPriceTable
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
        onValueChange={(t) => setBillingPeriod(t as BillingPeriod)}
      >
        <TabsList>
          <TabsTrigger value="monthly" label="Monthly Billing" />
          <TabsTrigger value="yearly" label="Yearly Billing" />
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
