import {
  BoltIcon,
  Button,
  ClockIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

interface TriggerSelectorDropdownProps {
  onCreateTrigger: () => void;
}

export const TriggerSelectorDropdown = ({ onCreateTrigger }: TriggerSelectorDropdownProps) => {
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
          <Button 
            label="Schedule" 
            variant="ghost" 
            icon={ClockIcon}
            onClick={onCreateTrigger}
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
