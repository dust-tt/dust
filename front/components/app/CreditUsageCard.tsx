import { formatCredits } from "@app/lib/client/credits";
import { getActiveLocale } from "@app/lib/i18n/active_locale";
import { formatDate, formatNumber } from "@app/lib/i18n/format";
import { CoinsStacked01, cn, ProgressBar, Tooltip } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

export type CreditUsageTone = "on_target" | "elevated" | "critical";
export type CreditUsageCardVariant = "profile_menu" | "companion";

const CONTAINER_CLASSES: Record<CreditUsageCardVariant, string> = {
  profile_menu: "p-2",
  companion:
    "w-full rounded-xl border border-border bg-background p-3 shadow-sm",
};

const TONE_BAR_CLASSES: Record<CreditUsageTone, string> = {
  on_target: "bg-highlight-500",
  elevated: "bg-warning-500",
  critical: "bg-red-500",
};

const TONE_TEXT_CLASSES: Record<CreditUsageTone, string> = {
  on_target: "text-highlight-500",
  elevated: "text-warning-500",
  critical: "text-red-500",
};

interface CreditUsageCardProps {
  label: string;
  usedPercentage: number;
  tone: CreditUsageTone;
  variant: CreditUsageCardVariant;
  children: ReactNode;
  refillSchedule?: { date: string; credits: number }[];
}

export function CreditUsageCard({
  label,
  usedPercentage: rawUsedPercentage,
  tone,
  variant,
  children,
  refillSchedule,
}: CreditUsageCardProps) {
  const { t } = useLingui();
  const usedPercentage = Math.min(Math.max(rawUsedPercentage, 0), 100);

  const progressBar = (
    <ProgressBar
      aria-label={t`${label} used`}
      className="h-1 w-full bg-border"
      values={[
        { value: usedPercentage, className: TONE_BAR_CLASSES[tone] },
        { value: 100 - usedPercentage, className: "bg-transparent" },
      ]}
    />
  );

  return (
    <div className={cn("flex flex-col gap-2", CONTAINER_CLASSES[variant])}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-sm font-medium text-foreground">
          <div className="flex items-center gap-1">
            <CoinsStacked01 className="h-4 w-4 text-muted-foreground" />
            <span>{label}</span>
          </div>
          <span className={TONE_TEXT_CLASSES[tone]}>
            {formatNumber(usedPercentage / 100, { style: "percent" })}
          </span>
        </div>
        {refillSchedule && refillSchedule.length > 0 ? (
          <Tooltip
            tooltipTriggerAsChild
            trigger={
              <div className="flex h-1 w-full cursor-help items-center">
                {progressBar}
              </div>
            }
            label={
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">
                  <Trans>Reset schedule:</Trans>
                </span>
                {refillSchedule.map(({ date, credits }) => {
                  const refillDate = formatDate(
                    new Date(date),
                    {
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    },
                    getActiveLocale()
                  );
                  const refillCredits = formatCredits(credits);
                  return (
                    <span key={date}>
                      <Trans>
                        {refillDate}: +{refillCredits}
                      </Trans>
                    </span>
                  );
                })}
              </div>
            }
          />
        ) : (
          progressBar
        )}
      </div>
      <div className="text-xs font-medium text-muted-foreground">
        {children}
      </div>
    </div>
  );
}
