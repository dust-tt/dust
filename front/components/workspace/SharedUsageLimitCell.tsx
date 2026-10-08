import {
  AT_POOL_LIMIT_BAR_CLASSES,
  MUTED_BAR_CLASSES,
  OVER_POOL_LIMIT_BAR_CLASSES,
} from "@app/components/workspace/seat_styles";
import { formatCredits, roundCredits } from "@app/lib/client/credits";
import type { SharedUsageLimitWithUsage } from "@app/types/api/groups/shared_usage_limit";
import { ProgressBar } from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

interface SharedUsageLimitCellProps {
  usage: Omit<SharedUsageLimitWithUsage, "usageTarget"> | undefined;
}

export function SharedUsageLimitCell({ usage }: SharedUsageLimitCellProps) {
  const { t } = useLingui();

  if (!usage) {
    return <span className="text-sm text-muted-foreground">--</span>;
  }

  const { usedAwuCredits, limitAwuCredits } = usage;
  const isOverLimit = usedAwuCredits > limitAwuCredits;
  const isAtLimit = !isOverLimit && usedAwuCredits >= limitAwuCredits;
  const percentage =
    limitAwuCredits > 0
      ? Math.min(100, (usedAwuCredits / limitAwuCredits) * 100)
      : usedAwuCredits > 0
        ? 100
        : 0;
  const usedLabel = formatCredits(usedAwuCredits);
  const limitLabel = formatCredits(limitAwuCredits);
  const limitCreditCount = roundCredits(limitAwuCredits);

  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex justify-between text-xs tabular-nums text-foreground">
        <span>{usedLabel}</span>
        <span>{limitLabel}</span>
      </div>
      <div className="flex h-3 w-full items-center">
        <ProgressBar
          aria-label={t`Group budget usage`}
          aria-valuenow={percentage}
          aria-valuetext={t`${plural(limitCreditCount, {
            one: `${usedLabel} of ${limitLabel} credit used`,
            other: `${usedLabel} of ${limitLabel} credits used`,
          })}`}
          className="h-1 w-full gap-px"
          variant="transparent"
          values={[
            {
              value: percentage,
              className: isOverLimit
                ? OVER_POOL_LIMIT_BAR_CLASSES.fill
                : isAtLimit
                  ? AT_POOL_LIMIT_BAR_CLASSES.fill
                  : MUTED_BAR_CLASSES.fill,
            },
            { value: 100 - percentage, className: MUTED_BAR_CLASSES.track },
          ]}
        />
      </div>
    </div>
  );
}
