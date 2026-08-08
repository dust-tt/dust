import { z } from "zod";

export const PokeRoleSchema = z.enum([
  "admin",
  "billing",
  "engineering",
  "support",
  "talent",
]);

export type PokeRole = z.infer<typeof PokeRoleSchema>;

export type PokeRoleEntries = Record<string, PokeRole[]>;

export interface SuperuserMember {
  sId: string;
  email: string;
  fullName: string;
  membershipRole: string;
  isDustSuperUser: boolean;
}

export interface SuperuserMemberInfo extends SuperuserMember {
  hasPokeRoleEntry: boolean;
  pokeRoles: PokeRole[];
}

export interface OrphanedPokeRoleEntry {
  email: string;
  pokeRoles: PokeRole[];
}

export interface PokeGetSuperusers {
  members: SuperuserMember[];
  roleEntries: PokeRoleEntries;
}

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function hasPokeRole(
  userRoles: PokeRole[],
  requiredRoles: PokeRole[]
): boolean {
  const userRoleSet = new Set(userRoles);
  return requiredRoles.some((role) => userRoleSet.has(role));
}
