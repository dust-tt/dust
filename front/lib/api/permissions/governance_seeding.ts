import { getPublishingRestrictionLevel } from "@app/lib/api/assistant/publishing_restrictions";
import type { Authenticator } from "@app/lib/auth";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { CapabilitySpec } from "@app/types/group_permissions";
import { assertNever } from "@app/types/shared/utils/assert_never";
import assert from "assert";

/**
 * Governance capability seeders: the single source of truth for where each capability's default
 * grant should land, shared by two call sites:
 *
 * - `seedWorkspaceCapabilities`, called once from workspace provisioning (dust-tt/tasks#9454), to
 *   set a fresh workspace's default state.
 * - `migrations/20260721_backfill_governance_capabilities.ts`, which backfills existing
 *   workspaces from their current legacy state (feature flags, roles, etc).
 *
 * A capability seeder is defined once here; both call sites drive it identically — a fresh
 * workspace simply has no legacy flag set yet, so `resolveTarget` naturally resolves to the same
 * default a backfill would apply (e.g. no `disallow_agent_creation_to_users` flag => "everyone").
 *
 * To register a new capability, add an entry to CAPABILITY_SEEDERS below; nothing else needs to
 * change at either call site.
 */

// Where a capability's grant should land for a workspace.
export type CapabilityTarget = "everyone" | "builders" | "admins_only";

export interface CapabilitySeeder {
  capability: CapabilitySpec;
  // Decides the target for the workspace behind `auth`.
  resolveTarget: (auth: Authenticator) => Promise<CapabilityTarget>;
}

export const CAPABILITY_SEEDERS: CapabilitySeeder[] = [
  {
    capability: { grantType: "create", resourceType: "agent" },
    resolveTarget: async (auth) => {
      const disallowsUserCreation =
        await FeatureFlagResource.isEnabledForWorkspace(
          auth.getNonNullableWorkspace(),
          "disallow_agent_creation_to_users"
        );
      return disallowsUserCreation ? "builders" : "everyone";
    },
  },
  {
    capability: { grantType: "create", resourceType: "skill" },
    resolveTarget: async (_auth) => "builders",
  },
  {
    capability: { grantType: "publish", resourceType: "agent" },
    resolveTarget: async (auth) => {
      const featureFlags = (
        await FeatureFlagResource.listForWorkspace(
          auth.getNonNullableWorkspace()
        )
      ).map((flag) => flag.name);
      const level = getPublishingRestrictionLevel(featureFlags);
      switch (level) {
        case "admins_only":
          return "admins_only";
        case "builders_and_admins":
          return "builders";
        case null:
          return "everyone";
        default:
          assertNever(level);
      }
    },
  },
];

export type ApplyCapabilityOutcome =
  | "seeded_everybody"
  | "seeded_builders"
  | "skipped_admins_only"
  | "skipped_no_builders_group";

// Resolves a seeder's raw target down to what will actually happen: "builders" degrades to
// "admins_only" if the workspace has no Builders group yet (no builder-role member has ever been
// synced into it — see `syncBuilderGroupMembership`). Deliberately never creates the group here;
// a capability grant with no members behind it isn't a meaningful default for either call site.
// Exposed so a caller that needs to know the effective target before deciding whether to write
// (the backfill script's idempotency check) doesn't have to duplicate the group lookup.
export async function resolveEffectiveTarget(
  auth: Authenticator,
  target: CapabilityTarget
): Promise<CapabilityTarget> {
  if (target !== "builders") {
    return target;
  }
  const buildersGroup = await GroupResource.fetchManualBuildersGroup(
    auth.getNonNullableWorkspace()
  );
  return buildersGroup ? "builders" : "admins_only";
}

// Applies an already-resolved target for one capability on the workspace behind `auth`. Shared
// write path for both call sites listed above. With `dryRun: true`, resolves and returns the
// outcome without writing — used by the backfill script's default dry-run mode.
export async function applyCapabilityTarget(
  auth: Authenticator,
  capability: CapabilitySpec,
  target: CapabilityTarget,
  { dryRun = false }: { dryRun?: boolean } = {}
): Promise<ApplyCapabilityOutcome> {
  const effectiveTarget = await resolveEffectiveTarget(auth, target);

  switch (effectiveTarget) {
    case "admins_only":
      return target === "builders"
        ? "skipped_no_builders_group"
        : "skipped_admins_only";
    case "everyone":
      if (!dryRun) {
        await GroupPermissionResource.setForEverybody(auth, capability);
      }
      return "seeded_everybody";
    case "builders": {
      if (!dryRun) {
        const buildersGroup = await GroupResource.fetchManualBuildersGroup(
          auth.getNonNullableWorkspace()
        );
        assert(
          buildersGroup,
          "Builders group disappeared between resolve and apply."
        );
        await GroupPermissionResource.setGroups(auth, capability, [
          buildersGroup,
        ]);
      }
      return "seeded_builders";
    }
    default:
      assertNever(effectiveTarget);
  }
}

// Seed default governance state for a newly created workspace. Called once from workspace
// provisioning. Runs seeders sequentially and unconditionally.
export async function seedWorkspaceCapabilities(
  auth: Authenticator
): Promise<void> {
  for (const seeder of CAPABILITY_SEEDERS) {
    const target = await seeder.resolveTarget(auth);
    await applyCapabilityTarget(auth, seeder.capability, target);
  }
}
