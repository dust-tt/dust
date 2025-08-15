import {
  BoltIcon,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

import { CreateScheduleModal } from "@app/components/agent_builder/triggers/CreateScheduleModal";

export const TriggerSelectorDropdown = ({}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          icon={BoltIcon}
          label="Add Trigger"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <div className="flex flex-col gap-2">
          <CreateScheduleModal />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
