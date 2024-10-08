import { Button, Hoverable, PriceTable, RocketIcon } from "@dust-tt/sparkle";
import type { BillingPeriod, PlanType } from "@dust-tt/types";
import { Tab } from "@headlessui/react";
import type { ReactNode } from "react";
import React, { useState } from "react";

import { FairUsageModal } from "@app/components/FairUsageModal";
import {
  getPriceWithCurrency,
  PRO_PLAN_COST_MONTHLY,
  PRO_PLAN_COST_YEARLY,
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

export type PriceTableDisplay = "landing" | "subscribe";

type PriceTableItem = {
  label: ReactNode;
  variant: "check" | "dash" | "xmark";
  display: PriceTableDisplay[];
};

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
    label: "Custom programmatic usage (API)",
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
    label: "Single Sign-On (SSO)",
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
    label: "Unlimited secure vaults",
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
  billingPeriod = "monthly",
}: {
  size: "sm" | "xs";
  plan?: PlanType;
  onClick?: () => void;
  isProcessing?: boolean;
  display: PriceTableDisplay;
  billingPeriod?: BillingPeriod;
}) {
  const [isFairUseModalOpened, setIsFairUseModalOpened] = useState(false);

  const PRO_PLAN_ITEMS: PriceTableItem[] = [
    {
      label: "From 1 user",
      variant: "check",
      display: ["landing", "subscribe"],
    },
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
      label: (
        <>
          Unlimited messages (
          <Hoverable onClick={() => setIsFairUseModalOpened(true)}>
            Fair use limits apply*
          </Hoverable>
          )
        </>
      ),
      variant: "check",
      display: ["landing", "subscribe"],
    },
    {
      label: "Limited Programmatic usage (API)",
      variant: "dash",
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
      label: "Google & GitHub Authentication",
      variant: "dash",
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
      label: "One secure vault",
      variant: "dash",
      display: ["landing"],
    },
  ];

  const biggerButtonSize = size === "xs" ? "sm" : "md";

  const price =
    billingPeriod === "monthly"
      ? getPriceWithCurrency(PRO_PLAN_COST_MONTHLY)
      : getPriceWithCurrency(PRO_PLAN_COST_YEARLY);

  return (
    <>
      <FairUsageModal
        isOpened={isFairUseModalOpened}
        onClose={() => setIsFairUseModalOpened(false)}
      />
      <PriceTable
        title="Pro"
        price={price}
        color="emerald"
        priceLabel="/ month / user, excl. tax"
        size={size}
        magnified={false}
      >
        {onClick && (!plan || plan.code !== PRO_PLAN_SEAT_29_CODE) && (
          <PriceTable.ActionContainer position="top">
            <Button
              variant="primary"
              size={biggerButtonSize}
              label="Start now, 15 days free"
              icon={RocketIcon}
              disabled={isProcessing}
              onClick={onClick}
            />
          </PriceTable.ActionContainer>
        )}
        {PRO_PLAN_ITEMS.filter((item) => item.display.includes(display)).map(
          (item, index) => (
            <PriceTable.Item
              key={index}
              label={item.label}
              variant={item.variant}
            />
          )
        )}
        {onClick && (!plan || plan.code !== PRO_PLAN_SEAT_29_CODE) && (
          <PriceTable.ActionContainer>
            <Button
              variant="primary"
              size={biggerButtonSize}
              label="Start now, 15 days free"
              icon={RocketIcon}
              disabled={isProcessing}
              onClick={onClick}
            />
          </PriceTable.ActionContainer>
        )}
      </PriceTable>
    </>
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
      <PriceTable.ActionContainer position="top">
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
      {ENTERPRISE_PLAN_ITEMS.map((item, index) => (
        <PriceTable.Item
          key={index}
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
  flexCSS = "mx-4 flex flex-row w-full md:-mx-12 md:gap-4 lg:gap-6 xl:mx-0 xl:gap-8 2xl:gap-10",
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
                    : "text-element-700 hover:bg-white/20 hover:text-white dark:text-element-700-dark"
                )
              }
            >
              Pro
            </Tab>
            <Tab
              className={({ selected }) =>
                classNames(
                  "w-full rounded-full font-semibold transition-all duration-300 ease-out",
                  "py-3 text-lg",
                  "ring-0 focus:outline-none",
                  selected
                    ? "bg-pink-400 text-white shadow dark:bg-pink-500"
                    : "text-element-700 hover:bg-white/20 hover:text-white dark:text-element-700-dark"
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
