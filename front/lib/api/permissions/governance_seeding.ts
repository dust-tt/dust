import type { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import type { CapabilitySpec } from "@app/types/group_permissions";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * Governance capability seeders: the single source of truth for where each capability's default
 * grant should land. Driven by `seedWorkspaceCapabilities`, called once from workspace
 * provisioning (dust-tt/tasks#9454), to set a fresh workspace's default state. Existing
 * workspaces were backfilled from their legacy state (feature flags, roles, etc) by the
 * since-deleted `migrations/20260721_backfill_governance_capabilities.ts`.
 *
 * To register a new capability, add an entry to CAPABILITY_SEEDERS below; nothing else needs to
 * change at the call site.
 */

// Where a capability's grant should land for a workspace.
type CapabilityTarget = "everyone" | "admins_only";

export interface CapabilitySeeder {
  capability: CapabilitySpec;
  // Decides the target for the workspace behind `auth`.
  resolveTarget: (auth: Authenticator) => Promise<CapabilityTarget>;
}

export const CAPABILITY_SEEDERS: CapabilitySeeder[] = [
  {
    capability: { grantType: "create", resourceType: "agent" },
    resolveTarget: async (_auth) => "everyone",
  },
  {
    capability: { grantType: "create", resourceType: "skill" },
    resolveTarget: async (_auth) => "admins_only",
  },
  // The workspace global group holds `reader` on every skill.
  {
    capability: { grantType: "reader", resourceType: "skill" },
    resolveTarget: async (_auth) => "everyone",
  },
  // it's safe to set them to "everyone" because there is another workspace level permission check
  // if inviting/publishing is allowed or not. We only check permission table if the feature itself is enabled
  {
    capability: { grantType: "invite", resourceType: "frame" },
    resolveTarget: async (_auth) => "everyone",
  },
  {
    capability: { grantType: "publish", resourceType: "frame" },
    resolveTarget: async (_auth) => "everyone",
  },
  {
    capability: { grantType: "publish", resourceType: "agent" },
    resolveTarget: async (_auth) => "everyone",
  },
];

type ApplyCapabilityOutcome =
  | "seeded_everybody"
  | "seeded_builders"
  | "skipped_admins_only";

// Applies an already-resolved target for one capability on the workspace behind `auth`.
export async function applyCapabilityTarget(
  auth: Authenticator,
  capability: CapabilitySpec,
  target: CapabilityTarget
): Promise<ApplyCapabilityOutcome> {
  switch (target) {
    case "admins_only":
      return "skipped_admins_only";
    case "everyone":
      await GroupPermissionResource.setForEverybody(auth, capability);
      return "seeded_everybody";
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
