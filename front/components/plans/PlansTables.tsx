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
import { trackEvent, TRACKING_AREAS } from "@app/lib/tracking";
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
    label: "Advanced security and controls",
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
    label: "User provisioning (SCIM)",
    variant: "check",
    display: ["landing"],
  },
  {
    label: "Salesforce Tool",
    variant: "check",
    display: ["landing"],
  },
];

function isProPlanCode(plan?: PlanType) {
  return (
    plan?.code === PRO_PLAN_SEAT_29_CODE ||
    plan?.code === PRO_PLAN_LARGE_FILES_CODE ||
    plan?.code === PRO_PLAN_SEAT_39_CODE
  );
}

interface PriceTableProps {
  billingPeriod?: BillingPeriod;
  display: PriceTableDisplay;
  isProcessing?: boolean;
  onClick?: () => void;
  owner?: WorkspaceType;
  plan?: PlanType;
  size: "sm" | "xs";
}

export function ProPriceTable({
  billingPeriod = "monthly",
  display,
  isProcessing,
  onClick,
  owner,
  plan,
  size,
}: PriceTableProps) {
  const [isFairUseModalOpened, setIsFairUseModalOpened] = useState(false);

  // If the owner has the business metadata, we show the BusinessPriceTable instead.
  if (owner?.metadata?.isBusiness) {
    return (
      <BusinessPriceTable
        display={display}
        isProcessing={isProcessing}
        onClick={onClick}
        plan={plan}
        size={size}
      />
    );
  }

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
      label: "Up to 1GB/user of data sources",
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
        priceLabel="/ month / user, excl. tax."
        size={size}
        magnified={false}
      >
        {onClick && (!plan || !isProPlanCode(plan)) && (
          <PriceTable.ActionContainer position="top">
            <Button
              variant="highlight"
              size={biggerButtonSize}
              label={
                display === "landing" ? "Start now, 15 days free" : "Start now"
              }
              icon={RocketIcon}
              disabled={isProcessing}
              onClick={() => {
                trackEvent({
                  area: TRACKING_AREAS.PRICING,
                  object: "plan_pro_select",
                  action: "click",
                });
                onClick();
              }}
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

export function BusinessPriceTable({
  display,
  isProcessing,
  onClick,
  plan,
  size,
}: PriceTableProps) {
  const [isFairUseModalOpened, setIsFairUseModalOpened] = useState(false);

  const PRO_PLAN_ITEMS: PriceTableItem[] = [
    {
      label: "From 1 user",
      variant: "check",
      display: ["landing", "subscribe"],
    },
    {
      label: "Multiple private spaces",
      variant: "check",
      display: ["landing"],
    },
    {
      label: "Flexible payment options (SEPA, Credit Card)",
      variant: "check",
      display: ["landing", "subscribe"],
    },
    {
      label: "US / EU data hosting",
      variant: "check",
      display: ["landing"],
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
      label: "Up to 1GB/user of data sources",
      variant: "dash",
      display: ["landing", "subscribe"],
    },
  ];

  const biggerButtonSize = size === "xs" ? "sm" : "md";

  const price = getPriceWithCurrency(BUSINESS_PLAN_COST_MONTHLY);

  return (
    <>
      <FairUsageModal
        isOpened={isFairUseModalOpened}
        onClose={() => setIsFairUseModalOpened(false)}
      />
      <PriceTable
        title="Business"
        price={price}
        color="blue"
        priceLabel="/ month / user, excl. tax."
        size={size}
        magnified={false}
      >
        {onClick && (!plan || !isProPlanCode(plan)) && (
          <PriceTable.ActionContainer position="top">
            <Button
              variant="highlight"
              size={biggerButtonSize}
              label={
                display === "landing" ? "Start now, 15 days free" : "Start now"
              }
              icon={RocketIcon}
              disabled={isProcessing}
              onClick={() => {
                trackEvent({
                  area: TRACKING_AREAS.PRICING,
                  object: "plan_pro_select",
                  action: "click",
                });
                onClick();
              }}
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
          onClick={() =>
            trackEvent({
              area: TRACKING_AREAS.PRICING,
              object: "plan_enterprise_contact",
              action: "click",
            })
          }
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
            <TabsTrigger value="pro" label="Pro" variant="outline" />
            <TabsTrigger
              value="enterprise"
              label="Enterprise"
              variant="outline"
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
