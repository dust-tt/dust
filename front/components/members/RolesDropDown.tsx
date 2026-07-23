import {
  displayRole,
  displayRoleCapitalized,
  ROLES_DATA,
} from "@app/components/members/Roles";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import type { ActiveRoleType } from "@app/types/user";
import { ACTIVE_ROLES, isAdmin } from "@app/types/user";
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
  const workspace = useWorkspace();
  const canManageAdminRole = isAdmin(workspace);

  const availableRoles = ACTIVE_ROLES.filter((role) => {
    // `manager` can only be assigned when the workspace has the
    // `admin_governance` feature flag.
    if (role === "manager" && !hasFeature("admin_governance")) {
      return false;
    }
    // `admin` can only be assigned by those allowed to manage the admin role
    // (matches the server-side escalation guard).
    if (role === "admin" && !canManageAdminRole) {
      return false;
    }
    return true;
  });

  // Lock the selector entirely when the target is an admin and the caller
  // cannot manage the admin role (they may neither demote nor revoke admins).
  const isLocked =
    disabled || (selectedRole === "admin" && !canManageAdminRole);

  if (isLocked) {
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
        <Button
          iconRight={ChevronDown}
          size="sm"
          label={displayRoleCapitalized(selectedRole)}
          variant="ghost"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {availableRoles.map((role) => (
          <DropdownMenuItem
            key={role}
            onClick={() => onChange(role)}
            label={displayRoleCapitalized(role)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
