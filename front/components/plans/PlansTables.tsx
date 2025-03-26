import {
  Button,
  Hoverable,
  PriceTable,
  RocketIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import React, { useState } from "react";

import { FairUsageModal } from "@app/components/FairUsageModal";
import {
  BUSINESS_PLAN_COST_MONTHLY,
  getPriceWithCurrency,
  PRO_PLAN_COST_MONTHLY,
  PRO_PLAN_COST_YEARLY,
} from "@app/lib/client/subscription";
import {
  PRO_PLAN_LARGE_FILES_CODE,
  PRO_PLAN_SEAT_29_CODE,
  PRO_PLAN_SEAT_39_CODE,
} from "@app/lib/plans/plan_codes";
import { classNames } from "@app/lib/utils";
import type { BillingPeriod, PlanType, WorkspaceType } from "@app/types";

export type PriceTableDisplay = "landing" | "subscribe";

type PriceTableItem = {
  label: ReactNode;
  variant: "check" | "dash" | "xmark";
  display: PriceTableDisplay[];
};

const ENTERPRISE_PLAN_ITEMS: PriceTableItem[] = [
  {
    label: "Everything in Pro, plus:",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Multiple private spaces",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Larger storage and file size limits",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Custom price on programmatic usage (API, GSheet, Zapier)",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Single Sign-On (SSO) (Okta, Entra ID, Jumpcloud)",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Flexible payment options (SEPA, Credit Card)",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Priority support & dedicated account management",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "Priority access to new features",
    variant: "check",
    display: ["landing", "subscribe"],
  },
  {
    label: "US / EU data hosting",
    variant: "check",
    display: ["landing"],
  },
  {
    label: "(soon) User provisioning",
    variant: "check",
    display: ["landing"],
  },
  {
    label: "(soon) Salesforce Connection",
    variant: "check",
    display: ["landing"],
  },
];

export function ProPriceTable({
  owner,
  size,
  plan,
  onClick,
  isProcessing,
  display,
  billingPeriod = "monthly",
}: {
  owner?: WorkspaceType;
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
      label: "Advanced models (GPT-4, Claude…)",
      variant: "check",
      display: ["landing", "subscribe"],
    },
    {
      label: "Custom agents which can execute actions",
      variant: "check",
      display: ["landing", "subscribe"],
    },
    {
      label: "Custom actions (Dust Apps)",
      variant: "check",
      display: ["landing", "subscribe"],
    },
    {
      label: "Connections (GitHub, Google Drive, Notion, Slack, ...)",
      variant: "check",
      display: ["landing", "subscribe"],
    },
    {
      label: "Native integrations (Zendesk, Slack, Chrome Extension)",
      variant: "check",
      display: ["landing", "subscribe"],
    },
    {
      label: "Privacy and Data Security (SOC2, Zero Data Retention)",
      variant: "check",
      display: ["landing"],
    },
    {
      label: (
        <>
          Unlimited messages (
          <Hoverable
            className="cursor-pointer text-gray-400 underline hover:text-gray-500"
            onClick={() => setIsFairUseModalOpened(true)}
          >
            Fair use limits apply*
          </Hoverable>
          )
        </>
      ),
      variant: "check",
      display: ["landing", "subscribe"],
    },
    {
      label: "Fixed price on programmatic usage (API, GSheet, Zapier)",
      variant: "dash",
      display: ["landing", "subscribe"],
    },
    {
      label: "Up to 1Gb/user of data sources",
      variant: "dash",
      display: ["landing", "subscribe"],
    },
    {
      label: "One private space",
      variant: "dash",
      display: ["landing"],
    },
  ];

  const biggerButtonSize = size === "xs" ? "sm" : "md";

  let price =
    billingPeriod === "monthly"
      ? getPriceWithCurrency(PRO_PLAN_COST_MONTHLY)
      : getPriceWithCurrency(PRO_PLAN_COST_YEARLY);

  const isBusiness = owner?.metadata?.isBusiness ?? false;
  if (isBusiness) {
    price = getPriceWithCurrency(BUSINESS_PLAN_COST_MONTHLY);
  }

  const isProPlanCode =
    plan?.code === PRO_PLAN_SEAT_29_CODE ||
    plan?.code === PRO_PLAN_LARGE_FILES_CODE ||
    plan?.code === PRO_PLAN_SEAT_39_CODE;

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
        priceLabel="/ month / user, excl. tax."
        size={size}
        magnified={false}
      >
        {onClick && (!plan || !isProPlanCode) && (
          <PriceTable.ActionContainer position="top">
            <Button
              variant="highlight"
              size={biggerButtonSize}
              label={
                display === "landing" ? "Start now, 15 days free" : "Start now"
              }
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
      </PriceTable>
    </>
  );
}
function EnterprisePriceTable({
  size,
  isProcessing,
}: {
  size: "sm" | "xs";
  isProcessing?: boolean;
}) {
  const biggerButtonSize = size === "xs" ? "sm" : "md";
  return (
    <PriceTable
      title="Enterprise"
      price="Custom"
      size={size}
      priceLabel=" pay-per-use, 100+ users"
      magnified={false}
    >
      <PriceTable.ActionContainer position="top">
        <Button
          href="/home/contact"
          variant="highlight"
          size={biggerButtonSize}
          disabled={isProcessing}
          label="Contact Sales"
        />
      </PriceTable.ActionContainer>
      {ENTERPRISE_PLAN_ITEMS.map((item, index) => (
        <PriceTable.Item
          key={index}
          label={item.label}
          variant={item.variant}
        />
      ))}
    </PriceTable>
  );
}

interface PricePlanProps {
  plan?: PlanType;
  onClickProPlan?: () => void;
  isProcessing?: boolean;
  flexCSS?: string;
  display: PriceTableDisplay;
}

export function PricePlans({
  flexCSS = "mx-4 flex flex-row w-full md:-mx-12 md:gap-4 lg:gap-6 xl:mx-0 xl:gap-8 2xl:gap-10",
  plan,
  onClickProPlan,
  isProcessing,
  display,
}: PricePlanProps) {
  return (
    <>
      {/* Tabs view for smaller screens (hidden on lg and above) */}
      <div
        className={classNames(
          "mx-0 sm:mx-24 lg:hidden",
          "w-full max-w-md px-2 sm:px-0"
        )}
      >
        <Tabs defaultValue="pro">
          <TabsList>
            <TabsTrigger value="pro" label="Pro" buttonVariant="outline" />
            <TabsTrigger
              value="enterprise"
              label="Enterprise"
              buttonVariant="outline"
            />
          </TabsList>
          <div className="mt-8">
            <TabsContent value="pro">
              <ProPriceTable
                display={display}
                size="xs"
                plan={plan}
                isProcessing={isProcessing}
                onClick={onClickProPlan}
              />
            </TabsContent>
            <TabsContent value="enterprise">
              <EnterprisePriceTable size="xs" isProcessing={isProcessing} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Cards view for larger screens (hidden below lg) */}
      <div className={classNames(flexCSS, "hidden lg:flex")}>
        <ProPriceTable
          size="sm"
          plan={plan}
          isProcessing={isProcessing}
          onClick={onClickProPlan}
          display={display}
        />
        <EnterprisePriceTable size="sm" isProcessing={isProcessing} />
      </div>
    </>
  );
}
