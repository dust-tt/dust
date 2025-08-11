import {
  Button,
  Checkbox,
  classNames,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from "@dust-tt/sparkle";
import { useState } from "react";
import { useController, useFormContext } from "react-hook-form";

import type { CapabilityFormData } from "@app/components/agent_builder/types";
import type { TimeFrame } from "@app/types";

const TIME_FRAME_UNITS = ["hour", "day", "week", "month", "year"] as const;

const TIME_FRAME_UNIT_TO_LABEL: Record<TimeFrame["unit"], string> = {
  hour: "hour(s)",
  day: "day(s)",
  week: "week(s)",
  month: "month(s)",
  year: "year(s)",
};

function isTimeFrameUnit(unit: string): unit is TimeFrame["unit"] {
  return (TIME_FRAME_UNITS as readonly string[]).includes(unit);
}

const DEFAULT_TIME_FRAME: TimeFrame = { duration: 1, unit: "day" };

type ActionType = "include" | "search" | "extract";

const ACTION_CONFIG: Record<
  ActionType,
  { actionText: string; contextText: string }
> = {
  include: { actionText: "Include", contextText: "data inclusion" },
  search: { actionText: "Search", contextText: "searching" },
  extract: { actionText: "Extract", contextText: "data extraction" },
};

interface TimeFrameSectionProps {
  actionType: ActionType;
}

export function TimeFrameSection({ actionType }: TimeFrameSectionProps) {
  const { setValue, getValues } = useFormContext();
  const [isChecked, setIsChecked] = useState(
    () => !!getValues("configuration.timeFrame")
  );

  const { field: timeFrameField } = useController<
    CapabilityFormData,
    "configuration.timeFrame"
  >({
    name: "configuration.timeFrame",
  });

  const { actionText, contextText } = ACTION_CONFIG[actionType];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-lg font-semibold">Time Range Configuration</h3>
        <p className="text-sm text-muted-foreground">
          By default, the time frame is determined automatically based on the
          conversation context. Enable manual time frame selection when you need
          to specify an exact range for {contextText}.
        </p>
      </div>

      <div className="flex flex-row items-center gap-4 pb-4">
        <Checkbox
          checked={isChecked}
          onCheckedChange={(checked) => {
            setIsChecked(Boolean(checked));
            setValue(
              "configuration.timeFrame",
              checked ? DEFAULT_TIME_FRAME : null
            );
          }}
        />
        <div
          className={classNames(
            "text-sm font-semibold",
            !getValues("configuration.timeFrame")
              ? "text-muted-foreground dark:text-muted-foreground-night"
              : "text-foreground dark:text-foreground-night"
          )}
        >
          {actionText} data from the last
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
              label={
                TIME_FRAME_UNIT_TO_LABEL[timeFrameField.value?.unit ?? "day"]
              }
              variant="outline"
              size="sm"
              disabled={!isChecked}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {Object.entries(TIME_FRAME_UNIT_TO_LABEL).map(([key, value]) => (
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
