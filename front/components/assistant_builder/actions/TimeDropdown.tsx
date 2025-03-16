import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

import { TIME_FRAME_UNIT_TO_LABEL } from "@app/components/assistant_builder/shared";
import type { AssistantBuilderTimeFrame } from "@app/components/assistant_builder/types";
import type { TimeframeUnit } from "@app/types";

interface TimeUnitDropdownProps<
  T extends { timeFrame?: AssistantBuilderTimeFrame | null },
> {
  timeFrame: AssistantBuilderTimeFrame;
  disabled?: boolean;
  onEdit: () => void;
  updateAction: (setNewAction: (previousAction: T) => T) => void;
}

export function TimeUnitDropdown<
  T extends { timeFrame?: AssistantBuilderTimeFrame | null },
>({ timeFrame, updateAction, onEdit, disabled }: TimeUnitDropdownProps<T>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          isSelect
          label={TIME_FRAME_UNIT_TO_LABEL[timeFrame.unit]}
          variant="outline"
          size="sm"
          disabled={disabled}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {Object.entries(TIME_FRAME_UNIT_TO_LABEL).map(([key, value]) => (
          <DropdownMenuItem
            key={key}
            label={value}
            onClick={() => {
              onEdit();
              updateAction((previousAction) => ({
                ...previousAction,
                timeFrame: {
                  value: timeFrame.value,
                  unit: key as TimeframeUnit,
                },
              }));
            }}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
