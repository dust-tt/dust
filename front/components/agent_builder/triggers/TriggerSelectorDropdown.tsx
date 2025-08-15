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

export const TriggerSelectorDropdown = ({
  onCreateTrigger,
}: TriggerSelectorDropdownProps) => {
  return (
    <Button
      label="Schedule"
      variant="primary"
      icon={ClockIcon}
      onClick={onCreateTrigger}
    />
  );
};
