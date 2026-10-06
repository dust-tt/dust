import config from "@app/lib/api/config";
import {
  BUSINESS_PLAN_COST_MONTHLY,
  PRO_PLAN_COST_MONTHLY,
  PRO_PLAN_COST_YEARLY,
  usePriceWithCurrency,
} from "@app/lib/client/subscription";
import { isWhitelistedBusinessPlan } from "@app/lib/plans/plan_codes";
import type { BillingPeriod } from "@app/types/plan";
import type { WorkspaceType } from "@app/types/user";
import { Button, Check, Icon } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";

const PRO_FEATURES: MessageDescriptor[] = [
  msg`From 1 user`,
  msg`Advanced AI models: GPT-5, Claude 4.5, Gemini, Mistral, and more`,
  msg`Data connections: Slack, Notion, Google Drive, GitHub, and more`,
  msg`Native integrations (Zendesk, Slack, Chrome Extension)`,
  msg`Email support: Get help when you need it`,
  msg`Free credits for programmatic usage (API, GSheet, Zapier)`,
];

const BUSINESS_EXTRA_FEATURES: MessageDescriptor[] = [
  msg`US / EU data hosting`,
  msg`Single Sign-On (SSO) (Okta, Entra ID, Jumpcloud)`,
  msg`Advanced connections (Salesforce, etc)`,
];

const ENTERPRISE_FEATURES: MessageDescriptor[] = [
  msg`Everything in Pro`,
  msg`Advanced security and controls`,
  msg`Larger storage and file size limits`,
  msg`Access to programmatic usage`,
  msg`Single Sign-On (SSO) (Okta, Entra ID, Jumpcloud)`,
  msg`User provisioning (SCIM)`,
  msg`Flexible billing options (SEPA, Credit Card)`,
  msg`Advanced connections (Salesforce, etc)`,
  msg`Priority access to new features`,
  msg`US / EU data hosting`,
  msg`Priority support`,
  msg`Dedicated Customer Success`,
];

interface SubscriptionPlanCardsProps {
  billingPeriod: BillingPeriod;
  onSubscribe: () => void;
  isProcessing: boolean;
  owner?: WorkspaceType;
}

export function SubscriptionPlanCards({
  billingPeriod,
  onSubscribe,
  isProcessing,
  owner,
}: SubscriptionPlanCardsProps) {
  const { t } = useLingui();
  const isBusiness = isWhitelistedBusinessPlan(owner);
  const rawPrice = isBusiness
    ? BUSINESS_PLAN_COST_MONTHLY
    : billingPeriod === "monthly"
      ? PRO_PLAN_COST_MONTHLY
      : PRO_PLAN_COST_YEARLY;
  const price = usePriceWithCurrency(rawPrice);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Pro card */}
      <div className="flex flex-col rounded-2xl border border-border p-5">
        <div className="mb-4">
          <h3 className="text-lg font-medium text-foreground">
            {isBusiness ? t`Enterprise (Seat-based)` : "Pro"}
          </h3>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-foreground">
              {price}
            </span>
            <span className="text-sm text-muted-foreground">
              <Trans>per user</Trans>
            </span>
          </div>
        </div>
        <div className="mb-4 border-t border-border" />
        <ul className="flex flex-1 flex-col gap-3">
          {[
            ...PRO_FEATURES,
            ...(isBusiness ? BUSINESS_EXTRA_FEATURES : []),
          ].map((feature, index) => (
            <li key={index} className="flex items-start gap-2">
              <Icon
                visual={Check}
                size="sm"
                className="mt-0.5 shrink-0 text-highlight-500"
              />
              <span className="text-sm text-foreground">{t(feature)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <Button
            variant="highlight"
            size="md"
            label={
              isBusiness
                ? t`Subscribe to Enterprise (Seat-based)`
                : t`Subscribe to Pro`
            }
            onClick={onSubscribe}
            disabled={isProcessing}
            className="w-full"
          />
        </div>
      </div>

      {/* Enterprise card */}
      <div className="flex flex-col rounded-2xl border border-border p-5">
        <div className="mb-4">
          <h3 className="text-lg font-medium text-foreground">Enterprise</h3>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-foreground">
              <Trans>Custom</Trans>
            </span>
            <span className="text-sm text-muted-foreground">
              <Trans>based on active users</Trans>
            </span>
          </div>
        </div>
        <div className="mb-4 border-t border-border" />
        <ul className="flex flex-1 flex-col gap-3">
          {ENTERPRISE_FEATURES.map((feature, index) => (
            <li key={index} className="flex items-start gap-2">
              <Icon
                visual={Check}
                size="sm"
                className="mt-0.5 shrink-0 text-highlight-500"
              />
              <span className="text-sm text-foreground">{t(feature)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <Button
            variant="outline"
            size="md"
            label={t`Contact sales`}
            href={`${config.getStaticWebsiteUrl()}/home/contact`}
            target="_blank"
            disabled={isProcessing}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
