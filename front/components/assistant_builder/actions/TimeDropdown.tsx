import {
  Button,
  NewDropdownMenu,
  NewDropdownMenuContent,
  NewDropdownMenuItem,
  NewDropdownMenuTrigger,
} from "@dust-tt/sparkle";
import type { TimeframeUnit } from "@dust-tt/types";

import { TIME_FRAME_UNIT_TO_LABEL } from "@app/components/assistant_builder/shared";
import type { AssistantBuilderTimeFrame } from "@app/components/assistant_builder/types";

interface TimeUnitDropdownProps<
  T extends { timeFrame?: AssistantBuilderTimeFrame },
> {
  timeFrame: AssistantBuilderTimeFrame;
  disabled?: boolean;
  onEdit: () => void;
  updateAction: (setNewAction: (previousAction: T) => T) => void;
}

export function TimeUnitDropdown<
  T extends { timeFrame?: AssistantBuilderTimeFrame },
>({ timeFrame, updateAction, onEdit, disabled }: TimeUnitDropdownProps<T>) {
  return (
    <NewDropdownMenu>
      <NewDropdownMenuTrigger asChild>
        <Button
          isSelect
          label={TIME_FRAME_UNIT_TO_LABEL[timeFrame.unit]}
          variant="outline"
          size="sm"
          disabled={disabled}
        />
      </NewDropdownMenuTrigger>
      <NewDropdownMenuContent>
        {Object.entries(TIME_FRAME_UNIT_TO_LABEL).map(([key, value]) => (
          <NewDropdownMenuItem
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
      </NewDropdownMenuContent>
    </NewDropdownMenu>
  );
}
