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

import { ConfigurationSectionContainer } from "@app/components/assistant_builder/actions/configuration/ConfigurationSectionContainer";
import { TIME_FRAME_UNIT_TO_LABEL } from "@app/components/assistant_builder/shared";
import type { TimeFrame, TimeframeUnit } from "@app/types";

interface TimeFrameConfigurationSectionProps {
  timeFrame: TimeFrame | null;
  onConfigUpdate: (timeFrame: TimeFrame | null) => void;
}

export function TimeFrameConfigurationSection({
  timeFrame,
  onConfigUpdate,
}: TimeFrameConfigurationSectionProps) {
  const defaultTimeFrame: TimeFrame = {
    duration: 1,
    unit: "day",
  };

  const [timeFrameError, setTimeFrameError] = useState<string | null>(null);
  const timeFrameDisabled = !timeFrame;

  return (
    <ConfigurationSectionContainer
      title="Time Range"
      description="By default, the time frame is determined automatically based on the
        conversation context. Enable manual time frame selection when you need
        to specify an exact range for data extraction."
    >
      <div className="flex flex-row items-center gap-4 pb-4">
        <Checkbox
          checked={!!timeFrame}
          onCheckedChange={(checked) => {
            checked ? onConfigUpdate(defaultTimeFrame) : onConfigUpdate(null);
          }}
        />
        <div
          className={classNames(
            "text-sm font-semibold",
            timeFrameDisabled
              ? "text-muted-foreground dark:text-muted-foreground-night"
              : "text-foreground dark:text-foreground-night"
          )}
        >
          Process data from the last
        </div>
        <Input
          name="timeFrameDuration"
          type="string"
          messageStatus={timeFrameError ? "error" : "default"}
          value={timeFrame?.duration.toString() ?? ""}
          onChange={(e) => {
            const duration = parseInt(e.target.value, 10);
            if (!isNaN(duration) || !e.target.value) {
              setTimeFrameError(null);
              onConfigUpdate({
                ...(timeFrame || defaultTimeFrame),
                duration: duration || 1,
              });
            }
          }}
          disabled={timeFrameDisabled}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              isSelect
              label={TIME_FRAME_UNIT_TO_LABEL[timeFrame?.unit ?? "day"]}
              variant="outline"
              size="sm"
              disabled={timeFrameDisabled}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {Object.entries(TIME_FRAME_UNIT_TO_LABEL).map(([key, value]) => (
              <DropdownMenuItem
                key={key}
                label={value}
                onClick={() => {
                  onConfigUpdate(
                    timeFrame
                      ? {
                          ...timeFrame,
                          unit: key as TimeframeUnit,
                        }
                      : defaultTimeFrame
                  );
                }}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </ConfigurationSectionContainer>
  );
}
