import { FairUsageModal } from "@app/components/FairUsageModal";
import {
  BUSINESS_PLAN_COST_MONTHLY,
  PRO_PLAN_COST_MONTHLY,
  PRO_PLAN_COST_YEARLY,
  usePriceWithCurrency,
} from "@app/lib/client/subscription";
import {
  isProOrBusinessPlanCode,
  isProPlan,
  isWhitelistedBusinessPlan,
} from "@app/lib/plans/plan_codes";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { BillingPeriod, PlanType } from "@app/types/plan";
import type { WorkspaceType } from "@app/types/user";
import { Button, Hoverable, PriceTable, Rocket02 } from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useState } from "react";

export type PriceTableDisplay = "landing" | "subscribe";

type PriceTableItem = {
  label: ReactNode;
  variant: "check" | "dash" | "xmark";
  display: PriceTableDisplay[];
};

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
            className="cursor-pointer text-muted-foreground underline hover:text-muted-foreground"
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
            className="cursor-pointer text-muted-foreground underline hover:text-muted-foreground"
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
              icon={Rocket02}
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
  const rawPrice =
    billingPeriod === "monthly" ? PRO_PLAN_COST_MONTHLY : PRO_PLAN_COST_YEARLY;
  const price = usePriceWithCurrency(rawPrice);

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
  const price = usePriceWithCurrency(BUSINESS_PLAN_COST_MONTHLY);
  return (
    <SeatBasedPriceTable
      plan="business"
      title="Enterprise (Seat-based)"
      color="blue"
      price={price}
      showButton={!plan || !isProPlan(plan)}
      display={display}
      isProcessing={isProcessing}
      onClick={onClick}
      size={size}
    />
  );
}
