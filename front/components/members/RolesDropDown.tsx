import { displayRole, ROLES_DATA } from "@app/components/members/Roles";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { ActiveRoleType } from "@app/types/user";
import { ACTIVE_ROLES } from "@app/types/user";
import {
  Button,
  ChevronDown,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

interface RoleDropDownProps {
  onChange: (role: ActiveRoleType) => void;
  selectedRole: ActiveRoleType;
  disabled?: boolean;
}

export function RoleDropDown({
  onChange,
  selectedRole,
  disabled = false,
}: RoleDropDownProps) {
  const { hasFeature } = useFeatureFlags();

  // `business_admin` can only be assigned when the
  // workspace has the `admin_governance` feature flag.
  const availableRoles = hasFeature("admin_governance")
    ? ACTIVE_ROLES
    : ACTIVE_ROLES.filter((role) => role !== "business_admin");

  if (disabled) {
    return (
      <Chip
        color={ROLES_DATA[selectedRole]["color"]}
        size="sm"
        className="capitalize"
      >
        {displayRole(selectedRole)}
      </Chip>
    );
  }

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
          <Button icon={ChevronDown} size="sm" variant="ghost" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {availableRoles.map((role) => (
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
