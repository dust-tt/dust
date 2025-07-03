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
  timeFrame: TimeFrame | null;
  setTimeFrame: (timeFrame: TimeFrame | null) => void;
  actionType: ActionType;
}

export function TimeFrameSection({
  timeFrame,
  setTimeFrame,
  actionType,
}: TimeFrameSectionProps) {
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
          checked={!!timeFrame}
          onCheckedChange={(checked) => {
            setTimeFrame(checked ? DEFAULT_TIME_FRAME : null);
          }}
        />
        <div
          className={classNames(
            "text-sm font-semibold",
            !timeFrame
              ? "text-muted-foreground dark:text-muted-foreground-night"
              : "text-foreground dark:text-foreground-night"
          )}
        >
          {actionText} data from the last
        </div>
        <Input
          name="timeFrameDuration"
          type="number"
          min="1"
          value={timeFrame?.duration.toString() ?? ""}
          onChange={(e) => {
            const duration = Math.max(1, parseInt(e.target.value, 10) || 1);
            setTimeFrame({
              ...(timeFrame || DEFAULT_TIME_FRAME),
              duration,
            });
          }}
          disabled={!timeFrame}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              isSelect
              label={TIME_FRAME_UNIT_TO_LABEL[timeFrame?.unit ?? "day"]}
              variant="outline"
              size="sm"
              disabled={!timeFrame}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {Object.entries(TIME_FRAME_UNIT_TO_LABEL).map(([key, value]) => (
              <DropdownMenuItem
                key={key}
                label={value}
                onClick={() => {
                  if (isTimeFrameUnit(key)) {
                    setTimeFrame(
                      timeFrame
                        ? { ...timeFrame, unit: key }
                        : { ...DEFAULT_TIME_FRAME, unit: key }
                    );
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
