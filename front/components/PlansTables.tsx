import { Button, PriceTable, RocketIcon } from "@dust-tt/sparkle";
import type { PlanType } from "@dust-tt/types";
import { Tab } from "@headlessui/react";
import React from "react";

import {
  getPriceWithCurrency,
  PRO_PLAN_29_COST,
} from "@app/lib/client/subscription";
import { PRO_PLAN_SEAT_29_CODE } from "@app/lib/plans/plan_codes";
import { classNames } from "@app/lib/utils";

interface PricePlanProps {
  size: "sm" | "xs";
  className?: string;
  isTabs?: boolean;
  plan?: PlanType;
  onClickProPlan?: () => void;
  onClickEnterprisePlan?: () => void;
  isProcessing?: boolean;
  flexCSS?: string;
  display: PriceTableDisplay;
}

type PriceTableDisplay = "landing" | "subscribe";

type PriceTableItem = {
  label: string;
  variant: "check" | "dash" | "xmark";
  display: PriceTableDisplay[];
};

const PRO_PLAN_ITEMS: PriceTableItem[] = [
  { label: "From 1 user", variant: "check", display: ["landing", "subscribe"] },
  {
    label: "One workspace",
    variant: "dash",
    display: ["landing"],
  },
  {
    label: "Privacy and Data Security",
    variant: "check",
    display: ["landing"],
  },
  {
    label: "Advanced models (GPT-4, Claude…)",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Unlimited custom assistants",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Unlimited messages",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Up to 1Gb/user of data sources",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Connections (GitHub, Google Drive, Notion, Slack, ...)",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Single Sign-on (Google, GitHub)",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Dust Slackbot",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Assistants can execute actions",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Workspace role and permissions",
    variant: "dash",
    display: ["landing"],
  },
];

const ENTERPRISE_PLAN_ITEMS: PriceTableItem[] = [
  {
    label: "From 100 users",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Multiple workspaces",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Privacy and Data Security",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Advanced models (GPT-4, Claude…)",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Unlimited custom assistants",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Unlimited messages",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Unlimited data sources",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Connections (GitHub, Google Drive, Notion, Slack, ...)",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Single Sign-on",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Dust Slackbot",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Assistants can execute actions",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Advanced workspace role and permissions",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Dedicated account support",
    variant: "check",
    display: ["landing", "subscribe"],
  },
];

export function ProPriceTable({
  size,
  plan,
  onClick,
  isProcessing,
  display,
}: {
  size: "sm" | "xs";
  plan?: PlanType;
  onClick?: () => void;
  isProcessing?: boolean;
  display: PriceTableDisplay;
}) {
  const biggerButtonSize = size === "xs" ? "sm" : "md";
  return (
    <PriceTable
      title="Pro"
      price={getPriceWithCurrency(PRO_PLAN_29_COST)}
      color="sky"
      priceLabel="/ month / user"
      size={size}
      magnified={false}
    >
      {PRO_PLAN_ITEMS.filter((item) => item.display.includes(display)).map(
        (item) => (
          <PriceTable.Item
            key={item.label}
            label={item.label}
            variant={item.variant}
          />
        )
      )}
      <PriceTable.ActionContainer>
        {plan && plan.code !== PRO_PLAN_SEAT_29_CODE && (
          <Button
            variant="primary"
            size={biggerButtonSize}
            label="Start now"
            icon={RocketIcon}
            disabled={isProcessing || plan.code === PRO_PLAN_SEAT_29_CODE}
            onClick={onClick}
          />
        )}
      </PriceTable.ActionContainer>
    </PriceTable>
  );
}
function EnterprisePriceTable({
  size,
  onClick,
  isProcessing,
}: {
  size: "sm" | "xs";
  onClick?: () => void;
  isProcessing?: boolean;
}) {
  const biggerButtonSize = size === "xs" ? "sm" : "md";
  return (
    <PriceTable title="Enterprise" price="Custom" size={size} magnified={false}>
      {ENTERPRISE_PLAN_ITEMS.map((item) => (
        <PriceTable.Item
          key={item.label}
          label={item.label}
          variant={item.variant}
        />
      ))}
      <PriceTable.ActionContainer>
        {onClick && (
          <Button
            variant="primary"
            size={biggerButtonSize}
            label="Contact us"
            disabled={isProcessing}
            onClick={onClick}
          />
        )}
      </PriceTable.ActionContainer>
    </PriceTable>
  );
}

export function PricePlans({
  size = "sm",
  isTabs = false,
  className = "",
  flexCSS = "mx-4 flex flex-row md:-mx-12 md:gap-4 lg:gap-6 xl:mx-0 xl:gap-8 2xl:gap-10",
  plan,
  onClickProPlan,
  onClickEnterprisePlan,
  isProcessing,
  display,
}: PricePlanProps) {
  if (isTabs) {
    return (
      <div
        className={classNames(
          "mx-0 sm:mx-24",
          "w-full max-w-md px-2 py-16 sm:px-0",
          className
        )}
      >
        <Tab.Group>
          <Tab.List
            className={classNames(
              "flex space-x-1 rounded-full border p-1 backdrop-blur",
              "s-border-structure-300/30 s-bg-white/80",
              "dark:s-border-structure-300-dark/30 dark:s-bg-structure-50-dark/80"
            )}
          >
            <Tab
              className={({ selected }) =>
                classNames(
                  "w-full rounded-full font-semibold transition-all duration-300 ease-out",
                  "py-2 text-sm",
                  "md:py-3 md:text-lg",
                  "ring-0 focus:outline-none",
                  selected
                    ? "bg-sky-400 text-white shadow dark:bg-sky-500"
                    : "dark:s-text-element-700-dark text-element-700 hover:bg-white/20 hover:text-white"
                )
              }
            >
              Pro
            </Tab>
            <Tab
              className={({ selected }) =>
                classNames(
                  "w-full rounded-full font-semibold transition-all duration-300 ease-out",
                  "py-2 text-sm",
                  "md:py-3 md:text-lg",
                  "ring-0 focus:outline-none",
                  selected
                    ? "bg-pink-400 text-white shadow dark:bg-pink-500"
                    : "dark:s-text-element-700-dark text-element-700 hover:bg-white/20 hover:text-white"
                )
              }
            >
              Enterprise
            </Tab>
          </Tab.List>
          <Tab.Panels className="mt-8">
            <Tab.Panel>
              <ProPriceTable
                display={display}
                size={size}
                plan={plan}
                isProcessing={isProcessing}
                onClick={onClickProPlan}
              />
            </Tab.Panel>
            <Tab.Panel>
              <EnterprisePriceTable
                size={size}
                isProcessing={isProcessing}
                onClick={onClickEnterprisePlan}
              />
            </Tab.Panel>
          </Tab.Panels>
        </Tab.Group>
      </div>
    );
  } else {
    return (
      <div className={classNames(flexCSS, className)}>
        <ProPriceTable
          size={size}
          plan={plan}
          isProcessing={isProcessing}
          onClick={onClickProPlan}
          display={display}
        />
        <EnterprisePriceTable
          size={size}
          isProcessing={isProcessing}
          onClick={onClickEnterprisePlan}
        />
      </div>
    );
  }
}
