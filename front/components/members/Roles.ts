import type { ActiveRoleType, RoleType } from "@app/types/user";

export function displayRole(role: RoleType): string {
  // `builder` is deprecated; surface it as a regular member to end users.
  if (role === "user" || role === "builder") {
    return "member";
  }
  return role;
}

export function displayRoleCapitalized(role: RoleType): string {
  const label = displayRole(role);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const ROLES_DATA: Record<
  ActiveRoleType,
  { description: string; color: "warning" | "info" | "success" | "highlight" }
> = {
  admin: {
    description:
      "Can use and create agents, manage settings, members, spaces, connections, and tools.",
    color: "warning",
  },
  manager: {
    description: "",
    color: "highlight",
  },
  // `builder` is deprecated; mirror the regular member appearance.
  builder: {
    description: "Can use and create agents in conversations.",
    color: "success",
  },
  user: {
    description: "Can use and create agents in conversations.",
    color: "success",
  },
};

// Role descriptions shown to workspaces with the `admin_governance` feature
const ADMIN_GOVERNANCE_ROLE_DESCRIPTIONS: Record<ActiveRoleType, string> = {
  user: "Can use agents in conversations. Building permissions are set by admins.",
  builder:
    "Can use agents in conversations. Building permissions are set by admins.",
  manager: "Can manage members, groups, roles, and workspace analytics.",
  admin:
    "Full administrative control, including settings, connections, billing, and governance.",
};

export function getRoleDescription(
  role: ActiveRoleType,
  hasAdminGovernance: boolean
): string {
  if (hasAdminGovernance) {
    return ADMIN_GOVERNANCE_ROLE_DESCRIPTIONS[role];
  }
  return ROLES_DATA[role].description;
}
