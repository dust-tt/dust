import type { Authenticator } from "@app/lib/auth";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { CapabilitySpec } from "@app/types/group_permissions";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * Governance capability seeders: the single source of truth for where each capability's default
 * grant should land, shared by two call sites:
 *
 * - `seedWorkspaceCapabilities`, called once from workspace provisioning (dust-tt/tasks#9454), to
 *   set a fresh workspace's default state.
 * - `migrations/20260721_backfill_create_agent_capability.ts`, which backfills existing
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
    // dust-tt/tasks#9463 — replaces the isBuilder()-gated create-agent check.
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
];

export type ApplyCapabilityOutcome =
  | "seeded_everybody"
  | "seeded_builders"
  | "skipped_admins_only";

// Applies an already-resolved target for one capability on the workspace behind `auth`. Shared
// write path for both call sites listed above. The "builders" target creates the workspace's
// Builders group if it doesn't exist yet (e.g. no builder-role member has ever been synced into
// it), so this never leaves the capability unconfigured. With `dryRun: true`, resolves and
// returns the outcome without writing — used by the backfill script's default dry-run mode.
export async function applyCapabilityTarget(
  auth: Authenticator,
  capability: CapabilitySpec,
  target: CapabilityTarget,
  { dryRun = false }: { dryRun?: boolean } = {}
): Promise<ApplyCapabilityOutcome> {
  switch (target) {
    case "admins_only":
      return "skipped_admins_only";
    case "everyone":
      if (!dryRun) {
        await GroupPermissionResource.setForEverybody(auth, capability);
      }
      return "seeded_everybody";
    case "builders": {
      if (!dryRun) {
        const buildersGroup =
          await GroupResource.fetchOrCreateManualBuildersGroup(
            auth.getNonNullableWorkspace()
          );
        await GroupPermissionResource.setGroups(auth, capability, [
          buildersGroup,
        ]);
      }
      return "seeded_builders";
    }
    default:
      assertNever(target);
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
