import {
  Button,
  ChevronDownIcon,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

import { displayRole, ROLES_DATA } from "@app/components/members/Roles";
import type { ActiveRoleType } from "@app/types";
import { ACTIVE_ROLES } from "@app/types";

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
            size="sm"
            className="capitalize"
          >
            {displayRole(selectedRole)}
          </Chip>
          <Button icon={ChevronDownIcon} size="sm" variant="ghost" />
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
