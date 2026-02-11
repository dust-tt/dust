import { Button, CheckIcon, Icon } from "@dust-tt/sparkle";

import {
  getPriceWithCurrency,
  PRO_PLAN_COST_MONTHLY,
  PRO_PLAN_COST_YEARLY,
} from "@app/lib/client/subscription";
import type { BillingPeriod } from "@app/types/plan";

const PRO_FEATURES = [
  "From 1 user",
  "Advanced AI models: GPT-5, Claude 4.5, Gemini, Mistral, and more",
  "Data connections: Slack, Notion, Google Drive, GitHub, and more",
  "Native integrations (Zendesk, Slack, Chrome Extension)",
  "Email support: Get help when you need it",
  "Free credits for programmatic usage (API, GSheet, Zapier)",
];

const ENTERPRISE_FEATURES = [
  "Everything in Pro",
  "Advanced security and controls",
  "Larger storage and file size limits",
  "Access to programmatic usage",
  "Single Sign-On (SSO) (Okta, Entra ID, Jumpcloud)",
  "User provisioning (SCIM)",
  "Flexible billing options (SEPA, Credit Card)",
  "Advanced connections (Salesforce, etc)",
  "Priority access to new features",
  "US / EU data hosting",
  "Priority support",
  "Dedicated Customer Success",
];

interface SubscriptionPlanCardsProps {
  billingPeriod: BillingPeriod;
  onSubscribe: () => void;
  isProcessing: boolean;
}

export function SubscriptionPlanCards({
  billingPeriod,
  onSubscribe,
  isProcessing,
}: SubscriptionPlanCardsProps) {
  const price =
    billingPeriod === "monthly"
      ? getPriceWithCurrency(PRO_PLAN_COST_MONTHLY)
      : getPriceWithCurrency(PRO_PLAN_COST_YEARLY);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Pro card */}
      <div className="flex flex-col rounded-[20px] border border-border p-5">
        <div className="mb-4">
          <h3 className="text-lg font-medium text-foreground dark:text-foreground-night">
            Pro
          </h3>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-foreground dark:text-foreground-night">
              {price}
            </span>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              per user
            </span>
          </div>
        </div>
        <div className="mb-4 border-t border-border" />
        <ul className="flex flex-1 flex-col gap-3">
          {PRO_FEATURES.map((feature, index) => (
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
        <div className="mt-6">
          <Button
            variant="highlight"
            size="md"
            label="Subscribe to Pro"
            onClick={onSubscribe}
            disabled={isProcessing}
            className="w-full"
          />
        </div>
      </div>

      {/* Enterprise card */}
      <div className="flex flex-col rounded-[20px] border border-border p-5">
        <div className="mb-4">
          <h3 className="text-lg font-medium text-foreground dark:text-foreground-night">
            Enterprise
          </h3>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-foreground dark:text-foreground-night">
              Custom
            </span>
            <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              pay-per-use, from 100+ users
            </span>
          </div>
        </div>
        <div className="mb-4 border-t border-border" />
        <ul className="flex flex-1 flex-col gap-3">
          {ENTERPRISE_FEATURES.map((feature, index) => (
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
        <div className="mt-6">
          <Button
            variant="outline"
            size="md"
            label="Contact sales"
            href="/home/contact"
            target="_blank"
            disabled={isProcessing}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
