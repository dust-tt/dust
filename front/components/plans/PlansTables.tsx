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
  isProOrBusinessPlanCode,
  isProPlan,
  isWhitelistedBusinessPlan,
} from "@app/lib/plans/plan_codes";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { classNames } from "@app/lib/utils";
import type { BillingPeriod, PlanType } from "@app/types/plan";
import type { WorkspaceType } from "@app/types/user";

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

type SeatBasedPlan = "pro" | "business";

type SeatBasedPlanItem = PriceTableItem & {
  plans: SeatBasedPlan[];
};

function getSeatBasedPlanItems(
  plan: SeatBasedPlan,
  openFairUseModal: () => void
): PriceTableItem[] {
  const allItems: SeatBasedPlanItem[] = [
    {
      label: "From 1 user",
      variant: "check",
      display: ["landing", "subscribe"],
      plans: ["pro", "business"],
    },
    {
      label: "Multiple private spaces",
      variant: "check",
      display: ["landing"],
      plans: ["business"],
    },
    {
      label: "Flexible payment options (SEPA, Credit Card)",
      variant: "check",
      display: ["landing", "subscribe"],
      plans: ["business"],
    },
    {
      label: "US / EU data hosting",
      variant: "check",
      display: ["landing"],
      plans: ["business"],
    },
    {
      label: "Advanced models (GPT-5, Claude, Gemini, Mistral…)",
      variant: "check",
      display: ["landing", "subscribe"],
      plans: ["pro", "business"],
    },
    {
      label: "Custom agents which can execute actions",
      variant: "check",
      display: ["landing", "subscribe"],
      plans: ["pro", "business"],
    },
    {
      label: "Custom actions (Dust Apps)",
      variant: "check",
      display: ["landing", "subscribe"],
      plans: ["pro"],
    },
    {
      label: "Connections (GitHub, Google Drive, Notion, Slack, ...)",
      variant: "check",
      display: ["landing", "subscribe"],
      plans: ["pro", "business"],
    },
    {
      label: "Native integrations (Zendesk, Slack, Chrome Extension)",
      variant: "check",
      display: ["landing", "subscribe"],
      plans: ["pro", "business"],
    },
    {
      label: "Privacy and Data Security (SOC2, Zero Data Retention)",
      variant: "check",
      display: ["landing"],
      plans: ["pro", "business"],
    },
    {
      label: (
        <>
          Unlimited messages (
          <Hoverable
            className="cursor-pointer text-gray-400 underline hover:text-gray-500"
            onClick={openFairUseModal}
          >
            Fair use limits apply*
          </Hoverable>
          )
        </>
      ),
      variant: "check",
      display: ["landing", "subscribe"],
      plans: ["pro", "business"],
    },
    {
      label: (
        <>
          Free credits for programmatic usage (API, GSheet, Zapier,...) (
          <Hoverable
            className="cursor-pointer text-gray-400 underline hover:text-gray-500"
            href="https://dust-tt.notion.site/Programmatic-usage-at-Dust-2b728599d94181ceb124d8585f794e2e#2b728599d941808b8f8dfa8dbe7e466f"
            target="_blank"
          >
            Learn more
          </Hoverable>
          )
        </>
      ),
      variant: "check",
      display: ["landing", "subscribe"],
      plans: ["pro"],
    },
    {
      label: "Fixed price on additional programmatic usage",
      variant: "dash",
      display: ["landing", "subscribe"],
      plans: ["pro"],
    },
    {
      label: "Up to 1GB/user of data sources",
      variant: "dash",
      display: ["landing", "subscribe"],
      plans: ["pro", "business"],
    },
    {
      label: "One private space",
      variant: "dash",
      display: ["landing"],
      plans: ["pro"],
    },
  ];

  return allItems.filter((item) => item.plans.includes(plan));
}

interface SeatBasedPriceTableProps {
  plan: SeatBasedPlan;
  title: string;
  color: "emerald" | "blue";
  price: string;
  showButton: boolean;
  display: PriceTableDisplay;
  isProcessing?: boolean;
  onClick?: () => void;
  size: "sm" | "xs";
}

function SeatBasedPriceTable({
  plan,
  title,
  color,
  price,
  showButton,
  display,
  isProcessing,
  onClick,
  size,
}: SeatBasedPriceTableProps) {
  const [isFairUseModalOpened, setIsFairUseModalOpened] = useState(false);
  const biggerButtonSize = size === "xs" ? "sm" : "md";
  const items = getSeatBasedPlanItems(plan, () =>
    setIsFairUseModalOpened(true)
  );

  return (
    <>
      <FairUsageModal
        isOpened={isFairUseModalOpened}
        onClose={() => setIsFairUseModalOpened(false)}
      />
      <PriceTable
        title={title}
        price={price}
        color={color}
        priceLabel="/ month / user, excl. tax."
        size={size}
        magnified={false}
      >
        {onClick && showButton && (
          <PriceTable.ActionContainer position="top">
            <Button
              variant="highlight"
              size={biggerButtonSize}
              label={
                display === "landing" ? "Start now, 14 days free" : "Start now"
              }
              icon={RocketIcon}
              disabled={isProcessing}
              onClick={withTracking(
                TRACKING_AREAS.PRICING,
                "plan_pro_select",
                onClick
              )}
            />
          </PriceTable.ActionContainer>
        )}
        {items
          .filter((item) => item.display.includes(display))
          .map((item, index) => (
            <PriceTable.Item
              key={index}
              label={item.label}
              variant={item.variant}
            />
          ))}
      </PriceTable>
    </>
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
  if (isWhitelistedBusinessPlan(owner)) {
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

  const price =
    billingPeriod === "monthly"
      ? getPriceWithCurrency(PRO_PLAN_COST_MONTHLY)
      : getPriceWithCurrency(PRO_PLAN_COST_YEARLY);

  return (
    <SeatBasedPriceTable
      plan="pro"
      title="Pro"
      color="emerald"
      price={price}
      showButton={!plan || !isProOrBusinessPlanCode(plan)}
      display={display}
      isProcessing={isProcessing}
      onClick={onClick}
      size={size}
    />
  );
}

export function BusinessPriceTable({
  display,
  isProcessing,
  onClick,
  plan,
  size,
}: PriceTableProps) {
  return (
    <SeatBasedPriceTable
      plan="business"
      title="Enterprise (Seat-based)"
      color="blue"
      price={getPriceWithCurrency(BUSINESS_PLAN_COST_MONTHLY)}
      showButton={!plan || !isProPlan(plan)}
      display={display}
      isProcessing={isProcessing}
      onClick={onClick}
      size={size}
    />
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
          onClick={withTracking(
            TRACKING_AREAS.PRICING,
            "plan_enterprise_contact"
          )}
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
  owner?: WorkspaceType;
  plan?: PlanType;
  onClickProPlan?: () => void;
  isProcessing?: boolean;
  flexCSS?: string;
  display: PriceTableDisplay;
}

export function PricePlans({
  owner,
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
                owner={owner}
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
          owner={owner}
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
