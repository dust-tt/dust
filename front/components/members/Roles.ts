import type { ActiveRoleType, RoleType } from "@app/types/user";

export function displayRole(role: RoleType): string {
  if (role === "user") {
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
    description:
      "Can use and create agents, manage members, groups, roles, and workspace analytics.",
    color: "highlight",
  },
  builder: {
    description:
      "Can use, create agents and manage folders, websites and dust apps in the company space.",
    color: "info",
  },
  user: {
    description: "Can use and create agents in conversations.",
    color: "success",
  },
};
