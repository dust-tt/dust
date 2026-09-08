import { getPokeUserConfigBucket } from "@app/lib/file_storage";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

const PokeRoleSchema = z.enum([
  "admin",
  "billing",
  "engineering",
  "support",
  "talent",
]);

export type PokeRole = z.infer<typeof PokeRoleSchema>;

const RolesConfigSchema = z.record(z.string().email(), z.array(PokeRoleSchema));

type RolesConfig = z.infer<typeof RolesConfigSchema>;

const POKE_ROLES_FILE = "poke-roles.json";
const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedRoles: RolesConfig | null = null;
let cacheExpiresAtMs = 0;

const ALL_ROLES: PokeRole[] = PokeRoleSchema.options;

/**
 * IdP group names that grant each poke role. Keying by `PokeRole` forces a new
 * role to declare its groups instead of silently granting nothing.
 */
const ACCESS_GROUPS_BY_ROLE: Record<PokeRole, readonly string[]> = {
  admin: ["admin-mdm"],
  billing: ["billing-mdm"],
  engineering: ["engineering-mdm"],
  support: ["support-mdm"],
  talent: ["talent-mdm"],
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

async function loadRoles(): Promise<RolesConfig> {
  if (cachedRoles && Date.now() < cacheExpiresAtMs) {
    return cachedRoles;
  }

  try {
    const content = await getPokeUserConfigBucket({
      useServiceAccount: false,
    }).fetchFileContent(POKE_ROLES_FILE);
    const parsed: unknown = JSON.parse(content);
    const result = RolesConfigSchema.safeParse(parsed);

    if (!result.success) {
      throw new Error(`Invalid poke roles config: ${result.error.message}`);
    }

    cachedRoles = result.data;
    cacheExpiresAtMs = Date.now() + CACHE_TTL_MS;
    return cachedRoles;
  } catch (err) {
    logger.error(
      { err: normalizeError(err) },
      "Failed to load poke roles from GCS"
    );
    return cachedRoles ?? {};
  }
}

export async function getPokeRolesForUser(email: string): Promise<PokeRole[]> {
  if (isDevelopment()) {
    return ALL_ROLES;
  }
  const roles = await loadRoles();
  return roles[email] ?? [];
}

export function hasPokeRole(
  userRoles: PokeRole[],
  requiredRoles: PokeRole[]
): boolean {
  const userRoleSet = new Set(userRoles);
  return requiredRoles.some((r) => userRoleSet.has(r));
}
