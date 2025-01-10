import { Tabs, TabsContent, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import type { BillingPeriod, PlanType } from "@dust-tt/types";
import React from "react";

import type { PriceTableDisplay } from "@app/components/plans/PlansTables";
import { ProPriceTable } from "@app/components/plans/PlansTables";
import { classNames } from "@app/lib/utils";

export function ProPlansTable({
  size = "sm",
  className = "",
  plan,
  display,
  setBillingPeriod,
}: {
  size?: "sm" | "xs";
  className?: string;
  plan?: PlanType;
  display: PriceTableDisplay;
  setBillingPeriod: (billingPeriod: BillingPeriod) => void;
}) {
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
              display={display}
              size={size}
              plan={plan}
              billingPeriod="monthly"
            />
          </TabsContent>
          <TabsContent value="yearly">
            <ProPriceTable
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
