import type { ConsumptionPeriodSelection } from "@app/components/workspace/analytics/consumption/consumptionPeriod";
import {
  CONSUMPTION_PERIOD_OPTIONS,
  consumptionPeriodFromKey,
  consumptionPeriodKey,
  consumptionPeriodLabel,
} from "@app/components/workspace/analytics/consumption/consumptionPeriod";
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
          size="xs"
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
