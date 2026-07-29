import { getPokeUserConfigBucket } from "@app/lib/file_storage";
import { isGCSPreconditionFailedError } from "@app/lib/file_storage/types";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

export const PokeRoleSchema = z.enum([
  "admin",
  "billing",
  "engineering",
  "support",
  "talent",
]);

export type PokeRole = z.infer<typeof PokeRoleSchema>;

export const RolesConfigSchema = z.record(
  z.string().email(),
  z.array(PokeRoleSchema)
);

export type RolesConfig = z.infer<typeof RolesConfigSchema>;

export const POKE_ROLES_FILE = "poke-roles.json";

let cachedRoles: RolesConfig | null = null;
let cachedGeneration: number | null = null;

const ALL_ROLES: PokeRole[] = PokeRoleSchema.options;

export type RoleWriteError =
  | { type: "conflict"; message: string }
  | { type: "storage_error"; message: string }
  | { type: "validation_error"; message: string };

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function normalizeRolesConfig(config: RolesConfig): RolesConfig {
  const normalized: RolesConfig = {};

  const entries: [string, PokeRole[]][] = Object.entries(config);
  for (const [email, roles] of entries) {
    const normalizedKey = normalizeEmail(email);
    if (normalizedKey in normalized) {
      logger.warn(
        { original: email, normalizedKey },
        "Email normalization merged duplicate keys in roles config"
      );
      const existing = normalized[normalizedKey] ?? [];
      const merged = [...new Set([...existing, ...roles])];
      normalized[normalizedKey] = merged;
    } else {
      normalized[normalizedKey] = roles;
    }
  }

  return normalized;
}

export function invalidateRolesCache(): void {
  cachedRoles = null;
  cachedGeneration = null;
  logger.info("Poke roles cache invalidated");
}

export async function loadRolesWithGeneration(): Promise<{
  roles: RolesConfig;
  generation: number;
}> {
  const bucket = getPokeUserConfigBucket({ useServiceAccount: false });
  const gcsFile = bucket.file(POKE_ROLES_FILE);

  const [content] = await gcsFile.download();
  const [metadata] = await gcsFile.getMetadata();

  const parsed: unknown = JSON.parse(content.toString());
  const result = RolesConfigSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(`Invalid poke roles config: ${result.error.message}`);
  }

  const generation = Number(metadata.generation ?? 0);
  const normalized = normalizeRolesConfig(result.data);

  cachedRoles = normalized;
  cachedGeneration = generation;

  return { roles: normalized, generation };
}

export async function loadRolesForAuth(): Promise<RolesConfig> {
  const bucket = getPokeUserConfigBucket({ useServiceAccount: false });
  const gcsFile = bucket.file(POKE_ROLES_FILE);

  const [metadata] = await gcsFile.getMetadata();
  const currentGeneration = Number(metadata.generation ?? 0);

  if (
    cachedRoles &&
    cachedGeneration !== null &&
    cachedGeneration === currentGeneration
  ) {
    return cachedRoles;
  }

  const { roles } = await loadRolesWithGeneration();
  return roles;
}

export async function writeRoles(
  config: RolesConfig,
  generation: number
): Promise<Result<void, RoleWriteError>> {
  const validation = RolesConfigSchema.safeParse(config);
  if (!validation.success) {
    return new Err({
      type: "validation_error",
      message: `Invalid roles config: ${validation.error.message}`,
    });
  }

  const normalizedConfig = normalizeRolesConfig(validation.data);
  const serialized = JSON.stringify(normalizedConfig, null, 2);

  try {
    const bucket = getPokeUserConfigBucket({ useServiceAccount: false });
    await bucket.uploadRawContentToBucketWithPrecondition(
      {
        content: serialized,
        contentType: "application/json",
        filePath: POKE_ROLES_FILE,
      },
      {
        resumable: false,
        preconditionOpts: { ifGenerationMatch: generation },
      }
    );

    invalidateRolesCache();
    return new Ok(undefined);
  } catch (err) {
    const error = normalizeError(err);

    if (isGCSPreconditionFailedError(err)) {
      return new Err({
        type: "conflict",
        message: `Concurrent modification detected: ${error.message}`,
      });
    }

    logger.error({ err: error }, "Failed to write poke roles to GCS");
    return new Err({
      type: "storage_error",
      message: `Failed to write roles: ${error.message}`,
    });
  }
}

export async function getPokeRolesForUser(email: string): Promise<PokeRole[]> {
  if (isDevelopment()) {
    return ALL_ROLES;
  }
  const roles = await loadRolesForAuth();
  return roles[normalizeEmail(email)] ?? [];
}

export function hasPokeRole(
  userRoles: PokeRole[],
  requiredRoles: PokeRole[]
): boolean {
  const userRoleSet = new Set(userRoles);
  return requiredRoles.some((r) => userRoleSet.has(r));
}
