import { z } from "zod";

const PokeRoleSchema = z.enum([
  "admin",
  "billing",
  "engineering",
  "support",
  "talent",
]);

export type PokeRole = z.infer<typeof PokeRoleSchema>;

export const ALL_ROLES: PokeRole[] = PokeRoleSchema.options;

/**
 * IdP group names that grant each poke role. Keying by `PokeRole` forces a new
 * role to declare its groups instead of silently granting nothing.
 */
const ACCESS_GROUPS_BY_ROLE: Record<PokeRole, readonly string[]> = {
  admin: ["poke-admin"],
  billing: ["poke-billing"],
  engineering: ["poke-engineering"],
  support: ["poke-support"],
  talent: ["poke-talent"],
};

const ROLE_BY_ACCESS_GROUP = new Map<string, PokeRole>(
  ALL_ROLES.flatMap((role) =>
    ACCESS_GROUPS_BY_ROLE[role].map(
      (group) => [group.toLowerCase(), role] as const
    )
  )
);

export function mapAccessGroupNamesToPokeRoles(
  groupNames: readonly string[]
): PokeRole[] {
  const granted = new Set<PokeRole>();

  for (const groupName of groupNames) {
    const normalized = groupName.trim().toLowerCase();
    const at = normalized.indexOf("@");
    const localPart =
      at === -1 ? normalized : normalized.slice(0, at).trimEnd();
    if (at !== -1 && !/^[^@\s]+$/.test(normalized.slice(at + 1))) {
      continue;
    }

    const role = ROLE_BY_ACCESS_GROUP.get(localPart);
    if (role) {
      granted.add(role);
    }
  }

  return ALL_ROLES.filter((role) => granted.has(role));
}

export function hasPokeRole(
  userRoles: PokeRole[],
  requiredRoles: PokeRole[]
): boolean {
  const userRoleSet = new Set(userRoles);
  return requiredRoles.some((r) => userRoleSet.has(r));
}
