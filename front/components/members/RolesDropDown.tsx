import { displayRole, ROLES_DATA } from "@app/components/members/Roles";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { hasPermission } from "@app/types/permissions";
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
  const workspace = useWorkspace();
  const canManageAdminRole = hasPermission(
    workspace.role,
    "workspace:manage_admin_role"
  );

  const availableRoles = ACTIVE_ROLES.filter((role) => {
    // `business_admin` can only be assigned when the workspace has the
    // `admin_governance` feature flag.
    if (role === "business_admin" && !hasFeature("admin_governance")) {
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
