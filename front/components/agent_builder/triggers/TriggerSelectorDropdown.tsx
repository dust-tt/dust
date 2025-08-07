import { CreateScheduleModal } from "@app/components/agent_builder/triggers/CreateScheduleModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Button,
  BoltIcon,
} from "@dust-tt/sparkle";

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
