import type { BillingPeriod, PlanType } from "@dust-tt/types";
import { Tab } from "@headlessui/react";
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
      <Tab.Group>
        <Tab.List
          className={classNames(
            "flex space-x-1 rounded-full border p-1 backdrop-blur",
            "border-structure-300/30 bg-white/80",
            "dark:border-structure-300-dark/30 dark:bg-structure-50-dark/80"
          )}
        >
          <Tab
            className={({ selected }) =>
              classNames(
                "w-full rounded-full font-semibold transition-all duration-300 ease-out",
                "py-3 text-lg",
                "ring-0 focus:outline-none",
                selected
                  ? "bg-emerald-400 text-white shadow dark:bg-emerald-500"
                  : "text-element-700 hover:bg-white/20 hover:text-element-900 dark:text-element-700-dark"
              )
            }
            onClick={() => setBillingPeriod("monthly")}
          >
            Monthly Billing
          </Tab>
          <Tab
            className={({ selected }) =>
              classNames(
                "w-full rounded-full font-semibold transition-all duration-300 ease-out",
                "py-3 text-lg",
                "ring-0 focus:outline-none",
                selected
                  ? "bg-emerald-400 text-white shadow dark:bg-emerald-500"
                  : "text-element-700 hover:bg-white/20 hover:text-element-900 dark:text-element-700-dark"
              )
            }
            onClick={() => setBillingPeriod("yearly")}
          >
            Yearly Billing
          </Tab>
        </Tab.List>
        <Tab.Panels className="mt-8">
          <Tab.Panel>
            <ProPriceTable
              display={display}
              size={size}
              plan={plan}
              billingPeriod="monthly"
            />
          </Tab.Panel>
          <Tab.Panel>
            <ProPriceTable
              display={display}
              size={size}
              plan={plan}
              billingPeriod="yearly"
            />
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}
