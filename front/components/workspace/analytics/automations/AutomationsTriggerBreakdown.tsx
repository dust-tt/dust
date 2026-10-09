import type { AutomationsScope } from "@app/hooks/useAutomationsTriggerBreakdown";
import { useAutomationsTriggerBreakdown } from "@app/hooks/useAutomationsTriggerBreakdown";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import type { AutomationTriggerCreditDestination } from "@app/lib/api/analytics/automations/breakdown";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import { formatCredits } from "@app/lib/client/credits";
import { formatNumber } from "@app/lib/i18n/format";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { LoadingBlock, Tooltip } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

const CAPTION_TOOLTIP_LABEL: Record<AutomationsScope, MessageDescriptor> = {
  workspace: msg`Compared to the median across all triggers for this period.`,
  user: msg`Compared to the median across your triggers for this period.`,
};

const RATIO_MORE_THRESHOLD = 1.5;
const RATIO_LESS_THRESHOLD = 1 / RATIO_MORE_THRESHOLD;
const CREDIT_DESTINATION_FALLBACK_LABEL = msg`What consumes credits`;

function creditDestinationLabel(
  dimension: AutomationTriggerCreditDestination["dimension"]
): MessageDescriptor {
  switch (dimension) {
    case "tool":
      return msg`What tool is used`;
    case "model":
      return msg`What model is used`;
    case "skill":
      return msg`What skill is used`;
    default:
      assertNeverAndIgnore(dimension);
      return CREDIT_DESTINATION_FALLBACK_LABEL;
  }
}

function ratioCaption(value: number, median: number): MessageDescriptor {
  if (value <= 0 || median <= 0) {
    return msg`no comparison available`;
  }
  const ratio = value / median;
  if (ratio >= RATIO_MORE_THRESHOLD) {
    const multiple = Math.round(ratio);
    return msg`${multiple}x more than most`;
  }
  if (ratio <= RATIO_LESS_THRESHOLD) {
    const multiple = Math.round(1 / ratio);
    return msg`${multiple}x less than most`;
  }
  return msg`about typical`;
}

function StatBlock({
  label,
  primaryText,
  caption,
  captionTooltipLabel,
}: {
  label: string;
  primaryText: ReactNode;
  caption: string;
  captionTooltipLabel?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h4 className="text-xs font-semibold text-muted-foreground">{label}</h4>
      <div className="min-w-0 text-xs">
        <div className="truncate">{primaryText}</div>
        {captionTooltipLabel ? (
          <Tooltip
            tooltipTriggerAsChild
            trigger={
              <span className="ml-auto truncate text-muted-foreground">
                {caption}
              </span>
            }
            label={captionTooltipLabel}
          />
        ) : (
          <span className="ml-auto truncate text-muted-foreground">
            {caption}
          </span>
        )}
      </div>
    </div>
  );
}

function CreditDestinationBlock({
  workspaceId,
  triggerId,
  period,
  scope,
}: {
  workspaceId: string;
  triggerId: string;
  period: ConsumptionPeriodSelection;
  scope: AutomationsScope;
}) {
  const { t } = useLingui();
  const { creditDestination, isBreakdownLoading, isBreakdownError } =
    useAutomationsTriggerBreakdown({ workspaceId, triggerId, period, scope });

  if (isBreakdownLoading) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <h4 className="text-xs font-semibold text-muted-foreground">
          {t(CREDIT_DESTINATION_FALLBACK_LABEL)}
        </h4>
        <div className="min-w-0 text-xs">
          <LoadingBlock className="h-4 w-24" />
          <LoadingBlock className="h-3 w-20" />
        </div>
      </div>
    );
  }

  if (isBreakdownError || !creditDestination) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <h4 className="text-xs font-semibold text-muted-foreground">
          {t(CREDIT_DESTINATION_FALLBACK_LABEL)}
        </h4>
        <span className="text-xs text-muted-foreground">
          {isBreakdownError
            ? t`Failed to load breakdown.`
            : t`No attributed consumption.`}
        </span>
      </div>
    );
  }

  const percentage = Math.round(Math.min(100, creditDestination.share * 100));

  return (
    <StatBlock
      label={t(creditDestinationLabel(creditDestination.dimension))}
      primaryText={
        <span className="font-semibold text-foreground">
          {creditDestination.name}
        </span>
      }
      caption={t`${percentage}% of its credits`}
    />
  );
}

interface AutomationsTriggerBreakdownProps {
  workspaceId: string;
  trigger: AutomationTriggerRow;
  period: ConsumptionPeriodSelection;
  scope: AutomationsScope;
  medianRunCount: number;
  medianCostPerRun: number;
}

export function AutomationsTriggerBreakdown({
  workspaceId,
  trigger,
  period,
  scope,
  medianRunCount,
  medianCostPerRun,
}: AutomationsTriggerBreakdownProps) {
  const { t } = useLingui();
  const costPerRun =
    trigger.runCount > 0 ? trigger.credits / trigger.runCount : 0;
  const runCount = formatNumber(trigger.runCount);
  const formattedCostPerRun = formatCredits(costPerRun);

  return (
    <div className="grid grid-cols-3 gap-16 border-b border-separator px-2 pb-6 pt-4">
      <StatBlock
        label={t`How often it runs`}
        primaryText={
          <Trans>
            <span className="font-semibold text-foreground">{runCount}</span>{" "}
            <span className="text-muted-foreground">
              <Plural value={trigger.runCount} one="time" other="times" />
            </span>
          </Trans>
        }
        caption={t(ratioCaption(trigger.runCount, medianRunCount))}
        captionTooltipLabel={t(CAPTION_TOOLTIP_LABEL[scope])}
      />
      <StatBlock
        label={t`What each run costs`}
        primaryText={
          <Trans>
            <span className="font-semibold text-foreground">
              {formattedCostPerRun}
            </span>{" "}
            <span className="text-muted-foreground">credits</span>
          </Trans>
        }
        caption={t(ratioCaption(costPerRun, medianCostPerRun))}
      />
      <CreditDestinationBlock
        workspaceId={workspaceId}
        triggerId={trigger.triggerId}
        period={period}
        scope={scope}
      />
    </div>
  );
}
