import type { Authenticator } from "@app/lib/auth";

/**
 * Workspace-creation entry point for governance capability seeding.
 *
 * A capability seeder sets up the default state of a workspace-level governance capability (which
 * groups get it, or "everybody"/"disabled") for a freshly created workspace. Phase 2 capabilities
 * register their seeder here; Phase 0 ships the hook with an empty list, so it is a no-op.
 */

export interface CapabilitySeeder {
  // Stable identifier for logs / debugging (e.g. "create:agent").
  name: string;
  seed: (auth: Authenticator) => Promise<void>;
}

const CAPABILITY_SEEDERS: CapabilitySeeder[] = [];

// Seed default governance state for a newly created workspace. Called once from workspace
// provisioning. Runs seeders sequentially — the list is a small, static registry, not user data.
export async function seedWorkspaceCapabilities(
  auth: Authenticator
): Promise<void> {
  for (const seeder of CAPABILITY_SEEDERS) {
    await seeder.seed(auth);
  }
}
