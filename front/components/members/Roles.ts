import type { ActiveRoleType, RoleType } from "@app/types";

export function displayRole(role: RoleType): string {
  return role === "user" ? "member" : role;
}

export const ROLES_DATA: Record<
  ActiveRoleType,
  { description: string; color: "rose" | "golden" | "green" | "primary" }
> = {
  admin: {
    description: "Admins can manage members, in addition to builders' rights.",
    color: "rose",
  },
  builder: {
    description:
      "Builders can create custom agents and use advanced dev tools.",
    color: "golden",
  },
  user: {
    description:
      "Members can use agents provided by Dust as well as custom agents created by their company.",
    color: "green",
  },
};
