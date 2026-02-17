import type { ObservabilityTimeRangeType } from "@app/components/agent_builder/observability/constants";
import { OBSERVABILITY_TIME_RANGE } from "@app/components/agent_builder/observability/constants";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

interface WorkspaceAnalyticsTimeRangeSelectorProps {
  period: ObservabilityTimeRangeType;
  onPeriodChange: (period: ObservabilityTimeRangeType) => void;
}

export function WorkspaceAnalyticsTimeRangeSelector({
  period,
  onPeriodChange,
}: WorkspaceAnalyticsTimeRangeSelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button label={`${period} days`} size="xs" variant="outline" isSelect />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OBSERVABILITY_TIME_RANGE.map((p) => (
          <DropdownMenuItem
            key={p}
            label={`${p} days`}
            onClick={() => onPeriodChange(p)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
