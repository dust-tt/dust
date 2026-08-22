import config from "@app/lib/api/config";
import { getPokeUserConfigBucket } from "@app/lib/file_storage";
import logger from "@app/logger/logger";
import {
  normalizeEmail,
  type PokeRole,
  PokeRoleSchema,
} from "@app/types/poke/roles";
import { isDevelopment } from "@app/types/shared/env";
import { z } from "zod";

export type { PokeRole } from "@app/types/poke/roles";
export {
  hasPokeRole,
  normalizeEmail,
  PokeRoleSchema,
} from "@app/types/poke/roles";

export const RolesConfigSchema = z.record(
  z.string().email(),
  z.array(PokeRoleSchema)
);
export type RolesConfig = z.infer<typeof RolesConfigSchema>;

export const POKE_ROLES_FILE = "poke-roles.json";
// This file is shared by both regions and keyed by human email. Bucket versioning is rollback.
const CACHE_TTL_MS = 5 * 60 * 1000;
const ALL_ROLES: PokeRole[] = PokeRoleSchema.options;

let cachedRoles: RolesConfig | null = null;
let cacheExpiresAtMs = 0;
let developmentRoles: RolesConfig = {};

function normalizeRolesConfig(config: RolesConfig): RolesConfig {
  return Object.fromEntries(
    Object.entries(config).map(([email, roles]) => [
      normalizeEmail(email),
      [...new Set(roles)],
    ])
  );
}

function shouldUseDevelopmentStore(): boolean {
  return isDevelopment() && !config.getPokeUserConfigBucketName();
}

async function readRoles(): Promise<RolesConfig> {
  if (shouldUseDevelopmentStore()) {
    return structuredClone(developmentRoles);
  }

  const content = await getPokeUserConfigBucket({
    useServiceAccount: false,
  }).fetchFileContent(POKE_ROLES_FILE);
  const parsed: unknown = JSON.parse(content);
  return normalizeRolesConfig(RolesConfigSchema.parse(parsed));
}

/** Fresh read used by the permissions editor. */
export async function loadRolesForEditing(): Promise<RolesConfig> {
  return readRoles();
}

/** Validates and overwrites the current JSON object. Bucket versioning is the rollback mechanism. */
export async function writeRoles(config: RolesConfig): Promise<void> {
  const normalized = normalizeRolesConfig(RolesConfigSchema.parse(config));

  if (shouldUseDevelopmentStore()) {
    developmentRoles = structuredClone(normalized);
  } else {
    await getPokeUserConfigBucket({
      useServiceAccount: false,
    }).uploadRawContentToBucket({
      content: JSON.stringify(normalized, null, 2),
      contentType: "application/json",
      filePath: POKE_ROLES_FILE,
    });
  }

  cachedRoles = null;
  cacheExpiresAtMs = 0;
}

async function loadRolesForAuth(): Promise<RolesConfig> {
  if (cachedRoles && Date.now() < cacheExpiresAtMs) {
    return cachedRoles;
  }

  try {
    cachedRoles = await readRoles();
    cacheExpiresAtMs = Date.now() + CACHE_TTL_MS;
    return cachedRoles;
  } catch (err) {
    logger.error({ err }, "Failed to load poke roles from GCS");
    return cachedRoles ?? {};
  }
}

export async function getPokeRolesForUser(email: string): Promise<PokeRole[]> {
  if (isDevelopment()) {
    return ALL_ROLES;
  }
  const roles = await loadRolesForAuth();
  return roles[normalizeEmail(email)] ?? [];
}
