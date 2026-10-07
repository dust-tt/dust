import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { OBSERVABILITY_TIME_RANGE } from "@app/components/agent_builder/observability/constants";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

interface WorkspaceAnalyticsTimeRangeSelectorProps {
  period: ObservabilityTimeRangeType;
  onPeriodChange: (period: ObservabilityTimeRangeType) => void;
}

export function WorkspaceAnalyticsTimeRangeSelector({
  period,
  onPeriodChange,
}: WorkspaceAnalyticsTimeRangeSelectorProps) {
  const { t } = useLingui();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label={t`${plural(period, { one: "# day", other: "# days" })}`}
          size="xs"
          variant="outline"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OBSERVABILITY_TIME_RANGE.map((days) => (
          <DropdownMenuItem
            key={days}
            label={t`${plural(days, { one: "# day", other: "# days" })}`}
            onClick={() => onPeriodChange(days)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
