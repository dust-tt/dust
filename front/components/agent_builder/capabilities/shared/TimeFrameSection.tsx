import type { CapabilityFormData } from "@app/components/agent_builder/types";
import type { TimeFrame } from "@app/types/shared/utils/time_frame";
import {
  Button,
  Checkbox,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useController, useFormContext } from "react-hook-form";

const TIME_FRAME_UNITS = ["hour", "day", "week", "month", "year"] as const;

function isTimeFrameUnit(unit: string): unit is TimeFrame["unit"] {
  return (TIME_FRAME_UNITS as readonly string[]).includes(unit);
}

const DEFAULT_TIME_FRAME: TimeFrame = { duration: 1, unit: "day" };

type ActionType = "include" | "search" | "extract";

const ACTION_CONFIG: Record<
  ActionType,
  { label: MessageDescriptor; description: MessageDescriptor }
> = {
  include: {
    label: msg`Include data from the last`,
    description: msg`By default, the time frame is determined automatically based on the conversation context. Enable manual time frame selection when you need to specify an exact range for data inclusion.`,
  },
  search: {
    label: msg`Search data from the last`,
    description: msg`By default, the time frame is determined automatically based on the conversation context. Enable manual time frame selection when you need to specify an exact range for searching.`,
  },
  extract: {
    label: msg`Extract data from the last`,
    description: msg`By default, the time frame is determined automatically based on the conversation context. Enable manual time frame selection when you need to specify an exact range for data extraction.`,
  },
};

interface TimeFrameSectionProps {
  actionType: ActionType;
}

export function TimeFrameSection({ actionType }: TimeFrameSectionProps) {
  const { t } = useLingui();
  const { setValue } = useFormContext();

  const { field: timeFrameField } = useController<
    CapabilityFormData,
    "configuration.timeFrame"
  >({
    name: "configuration.timeFrame",
  });

  const isChecked = timeFrameField.value !== null;
  const { label, description } = ACTION_CONFIG[actionType];
  const duration = timeFrameField.value?.duration ?? 1;
  const timeFrameUnitToLabel: Record<TimeFrame["unit"], string> = {
    hour: t`${plural(duration, { one: "hour", other: "hours" })}`,
    day: t`${plural(duration, { one: "day", other: "days" })}`,
    week: t`${plural(duration, { one: "week", other: "weeks" })}`,
    month: t`${plural(duration, { one: "month", other: "months" })}`,
    year: t`${plural(duration, { one: "year", other: "years" })}`,
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-lg font-semibold">
          <Trans>Time range configuration</Trans>
        </h3>
        <p className="text-sm text-muted-foreground">{t(description)}</p>
      </div>

      <div className="flex flex-row items-center gap-4 pb-4">
        <Checkbox
          checked={isChecked}
          onCheckedChange={(checked) => {
            setValue(
              "configuration.timeFrame",
              checked ? DEFAULT_TIME_FRAME : null
            );
          }}
        />
        <div
          className={cn(
            "text-sm font-semibold",
            !isChecked ? "text-muted-foreground" : "text-foreground"
          )}
        >
          {t(label)}
        </div>
        <Input
          type="number"
          min="1"
          value={timeFrameField?.value?.duration.toString() ?? ""}
          onChange={(e) => {
            const duration = Math.max(1, parseInt(e.target.value, 10) || 1);
            timeFrameField.onChange({
              duration,
              unit: timeFrameField.value?.unit ?? "day",
            });
          }}
          disabled={!isChecked}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              isSelect
              label={timeFrameUnitToLabel[timeFrameField.value?.unit ?? "day"]}
              variant="outline"
              size="sm"
              disabled={!isChecked}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {Object.entries(timeFrameUnitToLabel).map(([key, value]) => (
              <DropdownMenuItem
                key={key}
                label={value}
                onClick={() => {
                  if (isTimeFrameUnit(key)) {
                    timeFrameField.onChange({
                      duration: timeFrameField.value?.duration ?? 1,
                      unit: key,
                    });
                  }
                }}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
