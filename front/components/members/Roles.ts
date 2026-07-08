import type { ActiveRoleType, RoleType } from "@app/types/user";

export function displayRole(role: RoleType): string {
  if (role === "user") {
    return "member";
  }
  if (role === "business_admin") {
    return "business admin";
  }
  return role;
}

export const ROLES_DATA: Record<
  ActiveRoleType,
  { description: string; color: "warning" | "info" | "success" | "primary" }
> = {
  admin: {
    description:
      "Can use and create agents, manage settings, members, spaces, connections, and tools.",
    color: "warning",
  },
  business_admin: {
    description: "Business administrator.",
    color: "primary",
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
