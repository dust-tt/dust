import type { ActiveRoleType, RoleType } from "@app/types/user";

export function displayRole(role: RoleType): string {
  return role === "user" ? "member" : role;
}

export const ROLES_DATA: Record<
  ActiveRoleType,
  { description: string; color: "rose" | "golden" | "green" | "primary" }
> = {
  admin: {
    description:
      "Can use and create agents, manage settings, members, spaces, connections, and tools.",
    color: "rose",
  },
  builder: {
    description:
      "Can use, create agents and manage folders, websites and dust apps in the company space.",
    color: "golden",
  },
  user: {
    description: "Can use and create agents in conversations.",
    color: "green",
  },
};
