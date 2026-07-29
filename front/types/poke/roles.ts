import { z } from "zod";

export const PokeRoleSchema = z.enum([
  "admin",
  "billing",
  "engineering",
  "support",
  "talent",
]);

export type PokeRole = z.infer<typeof PokeRoleSchema>;

export function hasPokeRole(
  userRoles: PokeRole[],
  requiredRoles: PokeRole[]
): boolean {
  const userRoleSet = new Set(userRoles);
  return requiredRoles.some((role) => userRoleSet.has(role));
}
