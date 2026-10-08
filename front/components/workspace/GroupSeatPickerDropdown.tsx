import { seatTypeDisplayName } from "@app/components/workspace/billing/seatTypeUtils";
import type { GroupGrantableSeatType } from "@app/types/groups";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface GroupSeatPickerDropdownProps {
  value: GroupGrantableSeatType | null;
  // The seat tiers the contract bills, already ordered. Only these are offered.
  grantableSeatTypes: GroupGrantableSeatType[];
  disabled?: boolean;
  onChange: (seatType: GroupGrantableSeatType | null) => void;
}

export function GroupSeatPickerDropdown({
  value,
  grantableSeatTypes,
  disabled,
  onChange,
}: GroupSeatPickerDropdownProps) {
  const { t } = useLingui();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          isSelect
          label={value ? seatTypeDisplayName(value, t) : t`No seat`}
          disabled={disabled}
          className="min-w-40 justify-between"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width)">
        <DropdownMenuCheckboxItem
          label={t`No seat`}
          checked={value === null}
          onCheckedChange={(checked) => checked && onChange(null)}
        />
        {grantableSeatTypes.map((seatType) => (
          <DropdownMenuCheckboxItem
            key={seatType}
            label={seatTypeDisplayName(seatType, t)}
            checked={value === seatType}
            onCheckedChange={(checked) => checked && onChange(seatType)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
