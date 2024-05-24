import {
  ChevronDownIcon,
  Chip,
  DropdownMenu,
  IconButton,
} from "@dust-tt/sparkle";
import type { ActiveRoleType } from "@dust-tt/types";
import { ACTIVE_ROLES } from "@dust-tt/types";

import { displayRole, ROLES_DATA } from "@app/components/members/Roles";

export function RoleDropDown({
  selectedRole,
  onChange,
}: {
  selectedRole: ActiveRoleType;
  onChange: (role: ActiveRoleType) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenu.Button>
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
            variant="secondary"
            className="group-hover:text-action-400"
          />
        </div>
      </DropdownMenu.Button>
      <DropdownMenu.Items origin="topLeft">
        {ACTIVE_ROLES.map((role) => (
          <DropdownMenu.Item
            key={role}
            onClick={() => onChange(role)}
            label={
              displayRole(role).charAt(0).toUpperCase() +
              displayRole(role).slice(1)
            }
          />
        ))}
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
