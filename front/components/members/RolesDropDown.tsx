import { ROLE_LABELS, ROLES_DATA } from "@app/components/members/Roles";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import type { ActiveRoleType } from "@app/types/user";
import { ASSIGNABLE_ROLES, isAdmin } from "@app/types/user";
import {
  Button,
  ChevronDown,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

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
  const { t } = useLingui();
  const workspace = useWorkspace();
  const canManageAdminRole = isAdmin(workspace);

  const availableRoles = ASSIGNABLE_ROLES.filter((role) => {
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
      <Chip color={ROLES_DATA[selectedRole]["color"]} size="sm">
        {t(ROLE_LABELS[selectedRole])}
      </Chip>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          iconRight={ChevronDown}
          size="sm"
          label={t(ROLE_LABELS[selectedRole])}
          variant="ghost"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {availableRoles.map((role) => (
          <DropdownMenuItem
            key={role}
            onClick={() => onChange(role)}
            label={t(ROLE_LABELS[role])}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
