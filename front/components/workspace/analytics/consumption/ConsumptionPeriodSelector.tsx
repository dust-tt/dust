import type {
  ConsumptionGranularity,
  ConsumptionPeriodSelection,
} from "@app/lib/analytics/consumption_period";
import {
  CONSUMPTION_GRANULARITY_OPTIONS,
  CONSUMPTION_PERIOD_OPTIONS,
  consumptionGranularityFromKey,
  consumptionGranularityLabel,
  consumptionPeriodFromKey,
  consumptionPeriodKey,
  consumptionPeriodLabel,
} from "@app/lib/analytics/consumption_period";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

interface ConsumptionPeriodSelectorProps {
  period: ConsumptionPeriodSelection;
  onPeriodChange: (period: ConsumptionPeriodSelection) => void;
}

export function ConsumptionPeriodSelector({
  period,
  onPeriodChange,
}: ConsumptionPeriodSelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label={consumptionPeriodLabel(period)}
          size="sm"
          variant="outline"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={consumptionPeriodKey(period)}
          onValueChange={(value) => {
            const selection = consumptionPeriodFromKey(value);
            if (selection) {
              onPeriodChange(selection);
            }
          }}
        >
          {CONSUMPTION_PERIOD_OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              key={consumptionPeriodKey(option)}
              value={consumptionPeriodKey(option)}
              label={consumptionPeriodLabel(option)}
            />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ConsumptionGranularitySelectorProps {
  granularity: ConsumptionGranularity;
  onGranularityChange: (granularity: ConsumptionGranularity) => void;
}

export function ConsumptionGranularitySelector({
  granularity,
  onGranularityChange,
}: ConsumptionGranularitySelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label={consumptionGranularityLabel(granularity)}
          size="sm"
          variant="outline"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={granularity}
          onValueChange={(value) => {
            const selection = consumptionGranularityFromKey(value);
            if (selection) {
              onGranularityChange(selection);
            }
          }}
        >
          {CONSUMPTION_GRANULARITY_OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              key={option}
              value={option}
              label={consumptionGranularityLabel(option)}
            />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
