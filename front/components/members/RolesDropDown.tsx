import {
  ChevronDownIcon,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
} from "@dust-tt/sparkle";
import type { ActiveRoleType } from "@dust-tt/types";
import { ACTIVE_ROLES } from "@dust-tt/types";

import { displayRole, ROLES_DATA } from "@app/components/members/Roles";

interface RoleDropDownProps {
  onChange: (role: ActiveRoleType) => void;
  selectedRole: ActiveRoleType;
}

export function RoleDropDown({ onChange, selectedRole }: RoleDropDownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="group flex cursor-pointer items-center gap-2">
          <Chip
            color={ROLES_DATA[selectedRole]["color"]}
            className="capitalize"
          >
            {displayRole(selectedRole)}
          </Chip>
          <IconButton
            icon={ChevronDownIcon}
            size="sm"
            variant="outline"
            className="group-hover:text-action-400"
          />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {ACTIVE_ROLES.map((role) => (
          <DropdownMenuItem
            key={role}
            onClick={() => onChange(role)}
            label={
              displayRole(role).charAt(0).toUpperCase() +
              displayRole(role).slice(1)
            }
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
