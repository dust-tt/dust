import {
  Button,
  NewDropdownMenu,
  NewDropdownMenuContent,
  NewDropdownMenuItem,
  NewDropdownMenuTrigger,
} from "@dust-tt/sparkle";
import type { TimeframeUnit } from "@dust-tt/types";

import { TIME_FRAME_UNIT_TO_LABEL } from "@app/components/assistant_builder/shared";
import type { AssistantBuilderBaseConfiguration } from "@app/components/assistant_builder/types";

interface TimeUnitDropdownProps<T extends AssistantBuilderBaseConfiguration> {
  actionConfiguration: T;
  onEdit: () => void;
  updateAction: (setNewAction: (previousAction: T) => T) => void;
}

export function TimeUnitDropdown<T extends AssistantBuilderBaseConfiguration>({
  actionConfiguration,
  updateAction,
  onEdit,
}: TimeUnitDropdownProps<T>) {
  return (
    <NewDropdownMenu>
      <NewDropdownMenuTrigger asChild>
        <Button
          isSelect
          label={TIME_FRAME_UNIT_TO_LABEL[actionConfiguration.timeFrame.unit]}
          variant="outline"
          size="sm"
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
                  value: previousAction.timeFrame.value,
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
