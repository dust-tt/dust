import {
  Check,
  ChevronRight,
  DropdownMenuSubTrigger,
  Icon,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

interface ModelPickerSubTriggerProps {
  label: string;
  icon?: ComponentType;
  // Shows a check to the right of the label when the current selection lives
  // below this trigger, so the path to it is visible as the user drills in.
  checked?: boolean;
}

// A submenu trigger with an optional left icon, a check when selected, and the
// trailing chevron. We render custom children (rather than the `label`/`icon`
// props) because `DropdownMenuSubTrigger` otherwise hardcodes its end slot to
// the chevron, leaving no room for the check.
export function ModelPickerSubTrigger({
  label,
  icon,
  checked,
}: ModelPickerSubTriggerProps) {
  return (
    <DropdownMenuSubTrigger>
      <span className="flex grow items-center gap-2.5">
        {icon && (
          <Icon visual={icon} size="sm" className="text-muted-foreground" />
        )}
        <span className="grow truncate">{label}</span>
        {checked && (
          <Icon visual={Check} size="xs" className="text-muted-foreground" />
        )}
        <Icon
          visual={ChevronRight}
          size="xs"
          className="text-muted-foreground"
        />
      </span>
    </DropdownMenuSubTrigger>
  );
}
