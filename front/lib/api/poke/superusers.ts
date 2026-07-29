import type { Authenticator } from "@app/lib/auth";
import type { PokeRole, RolesConfig } from "@app/lib/poke/roles";
import {
  invalidateRolesCache,
  loadRolesWithGeneration,
  normalizeEmail,
  writeRoles,
} from "@app/lib/poke/roles";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// ---------------------------------------------------------------------------
// Read-only types (from S02)
// ---------------------------------------------------------------------------

export type DriftState = "ok" | "db_only" | "roles_only" | "none";

export interface SuperuserMemberInfo {
  sId: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string | null;
  image: string | null;
  isDustSuperUser: boolean;
  pokeRoles: PokeRole[];
  driftState: DriftState;
  membershipRole: string;
}

export interface PokeGetSuperusers {
  members: SuperuserMemberInfo[];
  generation: number;
}

// ---------------------------------------------------------------------------
// Mutation domain types — discriminated union (correction #7)
// ---------------------------------------------------------------------------

export interface PartialFailureState {
  rolesWritten: boolean;
  dbUpdated: boolean;
  currentDriftState: DriftState;
  remediation: string;
  previousState: {
    isDustSuperUser: boolean;
    pokeRoles: PokeRole[];
  };
  currentState: {
    isDustSuperUser: boolean;
    pokeRoles: PokeRole[];
  };
}

export type SuperuserMutationError =
  | SuperuserNonPartialError
  | SuperuserPartialFailureError;

export interface SuperuserNonPartialError {
  type:
    | "not_found"
    | "not_active_member"
    | "already_superuser"
    | "not_superuser"
    | "last_admin"
    | "self_removal"
    | "no_drift"
    | "conflict"
    | "storage_error"
    | "invalid_request_error";
  message: string;
}

export interface SuperuserPartialFailureError {
  type: "partial_failure";
  message: string;
  partialFailure: PartialFailureState;
}

export interface SuperuserMutationResult {
  email: string;
  targetSId: string;
  targetName: string;
  previousState: {
    isDustSuperUser: boolean;
    pokeRoles: PokeRole[];
  };
  newState: {
    isDustSuperUser: boolean;
    pokeRoles: PokeRole[];
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeDriftState(
  isDustSuperUser: boolean,
  hasRoles: boolean
): DriftState {
  if (isDustSuperUser && hasRoles) {
    return "ok";
  }
  if (isDustSuperUser && !hasRoles) {
    return "db_only";
  }
  if (!isDustSuperUser && hasRoles) {
    return "roles_only";
  }
  return "none";
}

function countEffectiveAdmins(
  rolesConfig: RolesConfig,
  dbSuperUserMap: Map<string, boolean>
): number {
  let count = 0;
  for (const [email, roles] of Object.entries(rolesConfig)) {
    if (roles.includes("admin") && dbSuperUserMap.get(email) === true) {
      count++;
    }
  }
  return count;
}

function isLastAdmin(
  email: string,
  rolesConfig: RolesConfig,
  dbSuperUserMap: Map<string, boolean>
): boolean {
  const normalized = normalizeEmail(email);
  const userRoles = rolesConfig[normalized];
  if (!userRoles || !userRoles.includes("admin")) {
    return false;
  }
  if (dbSuperUserMap.get(normalized) !== true) {
    return false;
  }
  return countEffectiveAdmins(rolesConfig, dbSuperUserMap) <= 1;
}

function isSelfAction(auth: Authenticator, targetEmail: string): boolean {
  const actingEmail = auth.getNonNullableUser().email;
  return normalizeEmail(actingEmail) === normalizeEmail(targetEmail);
}

async function isActiveWorkspaceMember(
  auth: Authenticator,
  user: UserResource
): Promise<boolean> {
  const workspace = renderLightWorkspaceType({
    workspace: auth.getNonNullableWorkspace(),
  });
  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace,
    });
  return membership !== null;
}

async function buildDbSuperUserMap(
  rolesConfig: RolesConfig
): Promise<Map<string, boolean>> {
  const emails = Object.keys(rolesConfig);
  if (emails.length === 0) {
    return new Map();
  }
  const users = await UserResource.fetchByEmails(emails);
  const map = new Map<string, boolean>();
  for (const u of users) {
    map.set(normalizeEmail(u.email), u.isDustSuperUser);
  }
  return map;
}

// ---------------------------------------------------------------------------
// List (correction #1 — extracted from route handler, returns ALL active members)
// ---------------------------------------------------------------------------

export async function listSuperuserMembers(
  auth: Authenticator
): Promise<{ members: SuperuserMemberInfo[]; generation: number }> {
  const workspace = auth.getNonNullableWorkspace();
  const lightWorkspace = renderLightWorkspaceType({ workspace });

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace: lightWorkspace,
  });

  const userModelIds = memberships
    .map((m) => m.userId)
    .filter((id): id is number => id !== undefined);

  const users = await UserResource.fetchByModelIds(userModelIds);
  const userById = new Map(users.map((u) => [u.id, u]));

  const { roles, generation } = await loadRolesWithGeneration();

  const members: SuperuserMemberInfo[] = [];

  for (const membership of memberships) {
    const user = userById.get(membership.userId);
    if (!user) {
      continue;
    }

    const normalizedMemberEmail = normalizeEmail(user.email);
    const hasDbFlag = user.isDustSuperUser;
    const rolesForUser = roles[normalizedMemberEmail] ?? [];
    const hasRoles = rolesForUser.length > 0;
    const driftState = computeDriftState(hasDbFlag, hasRoles);

    members.push({
      sId: user.sId,
      email: user.email,
      fullName: user.fullName(),
      firstName: user.firstName,
      lastName: user.lastName,
      image: user.imageUrl,
      isDustSuperUser: hasDbFlag,
      pokeRoles: rolesForUser,
      driftState,
      membershipRole: membership.role,
    });
  }

  members.sort((a, b) => a.email.localeCompare(b.email));

  return { members, generation };
}

// ---------------------------------------------------------------------------
// Grant (correction #2 — active-membership validation)
// ---------------------------------------------------------------------------

export async function grantSuperuser(
  auth: Authenticator,
  email: string,
  roles: PokeRole[],
  generation: number
): Promise<Result<SuperuserMutationResult, SuperuserMutationError>> {
  const normalized = normalizeEmail(email);

  const user = await UserResource.fetchByEmail(normalized);
  if (!user) {
    return new Err({
      type: "not_found",
      message: `User not found: ${normalized}`,
    });
  }

  if (user.isDustSuperUser) {
    return new Err({
      type: "already_superuser",
      message: `User is already a superuser: ${normalized}`,
    });
  }

  if (!(await isActiveWorkspaceMember(auth, user))) {
    return new Err({
      type: "not_active_member",
      message: `User is not an active member of the workspace: ${normalized}`,
    });
  }

  const { roles: currentRolesConfig } = await loadRolesWithGeneration();
  const previousRoles = currentRolesConfig[normalized] ?? [];

  const newRolesConfig: RolesConfig = {
    ...currentRolesConfig,
    [normalized]: roles,
  };

  const writeResult = await writeRoles(newRolesConfig, generation);
  if (writeResult.isErr()) {
    const writeErr = writeResult.error;
    if (writeErr.type === "conflict") {
      return new Err({ type: "conflict", message: writeErr.message });
    }
    return new Err({ type: "storage_error", message: writeErr.message });
  }

  try {
    await user.setDustSuperUser(true);
  } catch (err) {
    const error = normalizeError(err);
    logger.error(
      { err: error, email: normalized },
      "Partial failure during grant: roles written to GCS but DB update failed"
    );

    invalidateRolesCache();
    const { roles: freshConfig } = await loadRolesWithGeneration();
    const freshRoles = freshConfig[normalized] ?? [];
    const drift = computeDriftState(false, freshRoles.length > 0);

    return new Err({
      type: "partial_failure",
      message: `Roles written to GCS but DB update failed: ${error.message}`,
      partialFailure: {
        rolesWritten: true,
        dbUpdated: false,
        currentDriftState: drift,
        remediation: "Use repair-drift to sync DB with GCS roles",
        previousState: {
          isDustSuperUser: false,
          pokeRoles: previousRoles,
        },
        currentState: {
          isDustSuperUser: false,
          pokeRoles: freshRoles,
        },
      },
    });
  }

  return new Ok({
    email: normalized,
    targetSId: user.sId,
    targetName: user.fullName(),
    previousState: {
      isDustSuperUser: false,
      pokeRoles: previousRoles,
    },
    newState: {
      isDustSuperUser: true,
      pokeRoles: roles,
    },
  });
}

// ---------------------------------------------------------------------------
// Revoke (correction #5 — effective admin counting)
// ---------------------------------------------------------------------------

export async function revokeSuperuser(
  auth: Authenticator,
  email: string,
  generation: number
): Promise<Result<SuperuserMutationResult, SuperuserMutationError>> {
  const normalized = normalizeEmail(email);

  const user = await UserResource.fetchByEmail(normalized);
  if (!user) {
    return new Err({
      type: "not_found",
      message: `User not found: ${normalized}`,
    });
  }

  const { roles: currentRolesConfig } = await loadRolesWithGeneration();
  const previousRoles = currentRolesConfig[normalized] ?? [];

  if (!user.isDustSuperUser && previousRoles.length === 0) {
    return new Err({
      type: "not_superuser",
      message: `User is not a superuser: ${normalized}`,
    });
  }

  const dbWasUpdated = user.isDustSuperUser;
  if (dbWasUpdated) {
    const dbSuperUserMap = await buildDbSuperUserMap(currentRolesConfig);

    if (isLastAdmin(normalized, currentRolesConfig, dbSuperUserMap)) {
      return new Err({
        type: "last_admin",
        message: "Cannot revoke the last admin superuser",
      });
    }

    if (isSelfAction(auth, normalized) && previousRoles.includes("admin")) {
      return new Err({
        type: "self_removal",
        message: "Cannot revoke your own admin superuser access",
      });
    }

    try {
      await user.setDustSuperUser(false);
    } catch (err) {
      const error = normalizeError(err);
      return new Err({
        type: "storage_error",
        message: `Failed to clear DB superuser flag: ${error.message}`,
      });
    }
  }

  const { [normalized]: _removed, ...remainingRoles } = currentRolesConfig;
  const writeResult = await writeRoles(remainingRoles, generation);
  if (writeResult.isErr()) {
    const writeErr = writeResult.error;

    if (!dbWasUpdated) {
      if (writeErr.type === "conflict") {
        return new Err({ type: "conflict", message: writeErr.message });
      }
      return new Err({ type: "storage_error", message: writeErr.message });
    }

    logger.error(
      { err: writeErr, email: normalized },
      "Partial failure during revoke: DB cleared but GCS role removal failed"
    );

    invalidateRolesCache();
    const { roles: freshConfig } = await loadRolesWithGeneration();
    const freshRoles = freshConfig[normalized] ?? [];
    const drift = computeDriftState(false, freshRoles.length > 0);

    if (writeErr.type === "conflict") {
      return new Err({
        type: "partial_failure",
        message: `DB cleared but GCS write conflict: ${writeErr.message}`,
        partialFailure: {
          rolesWritten: false,
          dbUpdated: true,
          currentDriftState: drift,
          remediation: "Retry revoke to remove stale GCS roles",
          previousState: {
            isDustSuperUser: true,
            pokeRoles: previousRoles,
          },
          currentState: {
            isDustSuperUser: false,
            pokeRoles: freshRoles,
          },
        },
      });
    }

    return new Err({
      type: "partial_failure",
      message: `DB cleared but GCS role removal failed: ${writeErr.message}`,
      partialFailure: {
        rolesWritten: false,
        dbUpdated: true,
        currentDriftState: drift,
        remediation: "Retry revoke to remove stale GCS roles",
        previousState: {
          isDustSuperUser: true,
          pokeRoles: previousRoles,
        },
        currentState: {
          isDustSuperUser: false,
          pokeRoles: freshRoles,
        },
      },
    });
  }

  return new Ok({
    email: normalized,
    targetSId: user.sId,
    targetName: user.fullName(),
    previousState: {
      isDustSuperUser: dbWasUpdated,
      pokeRoles: previousRoles,
    },
    newState: {
      isDustSuperUser: false,
      pokeRoles: [],
    },
  });
}

// ---------------------------------------------------------------------------
// Update roles (correction #5 — effective admin counting)
// ---------------------------------------------------------------------------

export async function updateSuperuserRoles(
  auth: Authenticator,
  email: string,
  roles: PokeRole[],
  generation: number
): Promise<Result<SuperuserMutationResult, SuperuserMutationError>> {
  const normalized = normalizeEmail(email);

  const user = await UserResource.fetchByEmail(normalized);
  if (!user) {
    return new Err({
      type: "not_found",
      message: `User not found: ${normalized}`,
    });
  }

  if (!user.isDustSuperUser) {
    return new Err({
      type: "not_superuser",
      message: `User is not a superuser: ${normalized}`,
    });
  }

  if (!(await isActiveWorkspaceMember(auth, user))) {
    return new Err({
      type: "not_active_member",
      message: `User is not an active member of the workspace: ${normalized}`,
    });
  }

  const { roles: currentRolesConfig } = await loadRolesWithGeneration();
  const previousRoles = currentRolesConfig[normalized] ?? [];

  if (previousRoles.includes("admin") && !roles.includes("admin")) {
    const dbSuperUserMap = await buildDbSuperUserMap(currentRolesConfig);

    if (isLastAdmin(normalized, currentRolesConfig, dbSuperUserMap)) {
      return new Err({
        type: "last_admin",
        message: "Cannot remove admin role from the last admin superuser",
      });
    }
  }

  if (
    isSelfAction(auth, normalized) &&
    previousRoles.includes("admin") &&
    !roles.includes("admin")
  ) {
    return new Err({
      type: "self_removal",
      message: "Cannot remove your own admin role",
    });
  }

  const newRolesConfig: RolesConfig = {
    ...currentRolesConfig,
    [normalized]: roles,
  };

  const writeResult = await writeRoles(newRolesConfig, generation);
  if (writeResult.isErr()) {
    const writeErr = writeResult.error;
    if (writeErr.type === "conflict") {
      return new Err({ type: "conflict", message: writeErr.message });
    }
    return new Err({ type: "storage_error", message: writeErr.message });
  }

  return new Ok({
    email: normalized,
    targetSId: user.sId,
    targetName: user.fullName(),
    previousState: {
      isDustSuperUser: true,
      pokeRoles: previousRoles,
    },
    newState: {
      isDustSuperUser: true,
      pokeRoles: roles,
    },
  });
}

// ---------------------------------------------------------------------------
// Repair drift (correction #4 — db_only requires explicit roles param)
// ---------------------------------------------------------------------------

export async function repairSuperuserDrift(
  auth: Authenticator,
  email: string,
  generation: number,
  roles?: PokeRole[]
): Promise<Result<SuperuserMutationResult, SuperuserMutationError>> {
  const normalized = normalizeEmail(email);

  const user = await UserResource.fetchByEmail(normalized);
  if (!user) {
    return new Err({
      type: "not_found",
      message: `User not found: ${normalized}`,
    });
  }

  invalidateRolesCache();
  const { roles: currentRolesConfig } = await loadRolesWithGeneration();
  const currentRoles = currentRolesConfig[normalized] ?? [];
  const hasRoles = currentRoles.length > 0;
  const drift = computeDriftState(user.isDustSuperUser, hasRoles);

  if (drift === "ok" || drift === "none") {
    return new Err({
      type: "no_drift",
      message: `No drift detected for ${normalized} (state: ${drift})`,
    });
  }

  if (!(await isActiveWorkspaceMember(auth, user))) {
    return new Err({
      type: "not_active_member",
      message: `User is not an active member of the workspace: ${normalized}`,
    });
  }

  const previousState = {
    isDustSuperUser: user.isDustSuperUser,
    pokeRoles: currentRoles,
  };

  switch (drift) {
    case "db_only": {
      if (!roles || roles.length === 0) {
        return new Err({
          type: "invalid_request_error",
          message:
            "db_only repair requires explicit role selection — roles must be provided and non-empty",
        });
      }

      const newRolesConfig: RolesConfig = {
        ...currentRolesConfig,
        [normalized]: roles,
      };

      const writeResult = await writeRoles(newRolesConfig, generation);
      if (writeResult.isErr()) {
        const writeErr = writeResult.error;
        if (writeErr.type === "conflict") {
          return new Err({ type: "conflict", message: writeErr.message });
        }
        return new Err({ type: "storage_error", message: writeErr.message });
      }

      return new Ok({
        email: normalized,
        targetSId: user.sId,
        targetName: user.fullName(),
        previousState,
        newState: {
          isDustSuperUser: true,
          pokeRoles: roles,
        },
      });
    }

    case "roles_only": {
      try {
        await user.setDustSuperUser(true);
      } catch (err) {
        const error = normalizeError(err);
        return new Err({
          type: "storage_error",
          message: `Failed to set DB superuser flag: ${error.message}`,
        });
      }

      return new Ok({
        email: normalized,
        targetSId: user.sId,
        targetName: user.fullName(),
        previousState,
        newState: {
          isDustSuperUser: true,
          pokeRoles: currentRoles,
        },
      });
    }
  }
}
