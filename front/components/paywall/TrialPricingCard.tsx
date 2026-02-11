import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  CheckIcon,
  Icon,
} from "@dust-tt/sparkle";

import {
  getPriceWithCurrency,
  PRO_PLAN_COST_MONTHLY,
  PRO_PLAN_COST_YEARLY,
} from "@app/lib/client/subscription";
import type { BillingPeriod } from "@app/types/plan";

interface TrialPricingCardProps {
  billingPeriod: BillingPeriod;
  onBillingPeriodChange: (period: BillingPeriod) => void;
  onSubscribe: () => void;
  isSubmitting: boolean;
}

const FEATURES = [
  "Advanced AI models: GPT-5, Claude 4.5, Gemini, Mistral...",
  "Custom agents: Build AI with your company knowledge",
  "Data connections: Slack, Notion, Google Drive, GitHub...",
  "Native integrations (Zendesk, Slack, Chrome Extension)",
  "Email support: Get help when you need it",
];

export function TrialPricingCard({
  billingPeriod,
  onBillingPeriodChange,
  onSubscribe,
  isSubmitting,
}: TrialPricingCardProps) {
  const price =
    billingPeriod === "monthly"
      ? getPriceWithCurrency(PRO_PLAN_COST_MONTHLY)
      : getPriceWithCurrency(PRO_PLAN_COST_YEARLY);

  return (
    <div className="flex flex-col gap-6">
      {/* Price and billing toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <span className="text-3xl font-bold tabular-nums text-foreground dark:text-foreground-night">
            {price}
          </span>
          <span className="whitespace-nowrap text-xs leading-tight text-muted-foreground dark:text-muted-foreground-night">
            per user
            <br />
            per month
          </span>
        </div>

        {/* Billing toggle */}
        <ButtonsSwitchList
          defaultValue={billingPeriod}
          size="xs"
          onValueChange={(v) => onBillingPeriodChange(v as BillingPeriod)}
        >
          <ButtonsSwitch value="monthly" label="Monthly" />
          <ButtonsSwitch value="yearly" label="Yearly" />
        </ButtonsSwitchList>
      </div>

      {/* Features list */}
      <ul className="flex flex-col gap-3">
        {FEATURES.map((feature, index) => (
          <li key={index} className="flex items-start gap-2">
            <Icon
              visual={CheckIcon}
              size="sm"
              className="mt-0.5 shrink-0 text-highlight-500 dark:text-highlight-500-night"
            />
            <span className="text-sm text-foreground dark:text-foreground-night">
              {feature}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA Button */}
      <Button
        variant="highlight"
        size="md"
        label="Continue with Pro"
        onClick={onSubscribe}
        disabled={isSubmitting}
        className="w-full"
      />
    </div>
  );
}
