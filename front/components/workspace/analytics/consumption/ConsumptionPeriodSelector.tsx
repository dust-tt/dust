import type {
  ConsumptionGranularity,
  ConsumptionPeriodSelection,
} from "@app/lib/analytics/consumption_period";
import {
  CONSUMPTION_GRANULARITY_OPTIONS,
  CONSUMPTION_PERIOD_OPTIONS,
  consumptionGranularityFromKey,
  consumptionPeriodFromKey,
  consumptionPeriodKey,
} from "@app/lib/analytics/consumption_period";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

export const CONSUMPTION_GRANULARITY_MESSAGES: Record<
  ConsumptionGranularity,
  MessageDescriptor
> = {
  day: msg`Daily`,
  week: msg`Weekly`,
  month: msg`Monthly`,
};

function consumptionPeriodMessage(
  selection: ConsumptionPeriodSelection
): MessageDescriptor {
  if (selection.kind === "cycle") {
    return msg`This cycle`;
  }
  const days = selection.days;
  return msg`Last ${days} days`;
}

interface ConsumptionPeriodSelectorProps {
  period: ConsumptionPeriodSelection;
  onPeriodChange: (period: ConsumptionPeriodSelection) => void;
}

export function ConsumptionPeriodSelector({
  period,
  onPeriodChange,
}: ConsumptionPeriodSelectorProps) {
  const { t } = useLingui();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label={t(consumptionPeriodMessage(period))}
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
              label={t(consumptionPeriodMessage(option))}
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
  const { t } = useLingui();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label={t(CONSUMPTION_GRANULARITY_MESSAGES[granularity])}
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
              label={t(CONSUMPTION_GRANULARITY_MESSAGES[option])}
            />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
