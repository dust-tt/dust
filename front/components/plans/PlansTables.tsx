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
import { Trans, useLingui } from "@lingui/react/macro";
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
      label: <Trans>From 1 user</Trans>,
      variant: "check",
      display: ["landing", "subscribe"],
      plans: ["pro", "business"],
    },
    {
      label: <Trans>Multiple private spaces</Trans>,
      variant: "check",
      display: ["landing"],
      plans: ["business"],
    },
    {
      label: <Trans>Flexible payment options (SEPA, Credit Card)</Trans>,
      variant: "check",
      display: ["landing", "subscribe"],
      plans: ["business"],
    },
    {
      label: <Trans>US / EU data hosting</Trans>,
      variant: "check",
      display: ["landing"],
      plans: ["business"],
    },
    {
      label: <Trans>Advanced models (GPT-5, Claude, Gemini, Mistral…)</Trans>,
      variant: "check",
      display: ["landing", "subscribe"],
      plans: ["pro", "business"],
    },
    {
      label: <Trans>Custom agents which can execute actions</Trans>,
      variant: "check",
      display: ["landing", "subscribe"],
      plans: ["pro", "business"],
    },
    {
      label: (
        <Trans>Connections (GitHub, Google Drive, Notion, Slack, ...)</Trans>
      ),
      variant: "check",
      display: ["landing", "subscribe"],
      plans: ["pro", "business"],
    },
    {
      label: (
        <Trans>Native integrations (Zendesk, Slack, Chrome Extension)</Trans>
      ),
      variant: "check",
      display: ["landing", "subscribe"],
      plans: ["pro", "business"],
    },
    {
      label: (
        <Trans>Privacy and Data Security (SOC2, Zero Data Retention)</Trans>
      ),
      variant: "check",
      display: ["landing"],
      plans: ["pro", "business"],
    },
    {
      label: (
        <Trans>
          Unlimited messages (
          <Hoverable
            className="cursor-pointer text-muted-foreground underline hover:text-muted-foreground"
            onClick={openFairUseModal}
          >
            Fair use limits apply*
          </Hoverable>
          )
        </Trans>
      ),
      variant: "check",
      display: ["landing", "subscribe"],
      plans: ["pro", "business"],
    },
    {
      label: (
        <Trans>
          Free credits for programmatic usage (API, GSheet, Zapier,...) (
          <Hoverable
            className="cursor-pointer text-muted-foreground underline hover:text-muted-foreground"
            href="https://dust-tt.notion.site/Programmatic-usage-at-Dust-2b728599d94181ceb124d8585f794e2e#2b728599d941808b8f8dfa8dbe7e466f"
            target="_blank"
          >
            Learn more
          </Hoverable>
          )
        </Trans>
      ),
      variant: "check",
      display: ["landing", "subscribe"],
      plans: ["pro"],
    },
    {
      label: <Trans>Fixed price on additional programmatic usage</Trans>,
      variant: "dash",
      display: ["landing", "subscribe"],
      plans: ["pro"],
    },
    {
      label: <Trans>Up to 1GB/user of data sources</Trans>,
      variant: "dash",
      display: ["landing", "subscribe"],
      plans: ["pro", "business"],
    },
    {
      label: <Trans>One private space</Trans>,
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
  const { t } = useLingui();
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
        priceLabel={t`/ month / user, excl. tax.`}
        size={size}
        magnified={false}
      >
        {onClick && showButton && (
          <PriceTable.ActionContainer position="top">
            <Button
              variant="highlight"
              size={biggerButtonSize}
              label={
                display === "landing"
                  ? t`Start now, 14 days free`
                  : t`Start now`
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
  const { t } = useLingui();
  const price = usePriceWithCurrency(BUSINESS_PLAN_COST_MONTHLY);
  return (
    <SeatBasedPriceTable
      plan="business"
      title={t`Enterprise (Seat-based)`}
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
