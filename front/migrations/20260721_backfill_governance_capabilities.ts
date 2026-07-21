import {
  applyCapabilityTarget,
  CAPABILITY_SEEDERS,
} from "@app/lib/api/permissions/governance_seeding";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { CapabilityKey } from "@app/types/group_permissions";
import { capabilityKey } from "@app/types/group_permissions";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";

interface SeederCounts {
  seededEverybody: number;
  seededBuilders: number;
  alreadySet: number;
  skippedAdminsOnly: number;
}

function newCounts(): SeederCounts {
  return {
    seededEverybody: 0,
    seededBuilders: 0,
    alreadySet: 0,
    skippedAdminsOnly: 0,
  };
}

/**
 * Backfill governance capabilities (`group_permissions`) for every seeder registered in
 * `CAPABILITY_SEEDERS` (`@app/lib/api/permissions/governance_seeding`), from each existing
 * workspace's current legacy configuration, so that once a capability's
 * `auth.hasWorkspacePermission(verb, resourceType)` check is enforced server-side, every
 * workspace preserves its effective access as of today. Runs every registered capability in one
 * pass — adding a new seeder to the registry is picked up here automatically, no script changes
 * needed. First capabilities: `create agent` (dust-tt/tasks#9463) and `create skill`
 * (dust-tt/tasks#9464).
 *
 * The seeders themselves — which capability, and what target (everyone / builders / admins_only)
 * a workspace resolves to — are shared with `seedWorkspaceCapabilities`, which applies the same
 * registry to brand-new workspaces at creation time (dust-tt/tasks#9454). This script is only
 * responsible for existing workspaces: it adds the idempotency check (skip if already configured)
 * and the dry-run/--execute gating that a one-time backfill needs but workspace creation doesn't.
 *
 * Pass `--wId <workspaceId>` to run on a single workspace.
 */
makeScript(
  {
    wId: {
      type: "string",
      required: false,
      description: "Run on a single workspace (sId).",
    },
  },
  async ({ execute, wId }, logger) => {
    const countsByCapability = new Map<CapabilityKey, SeederCounts>(
      CAPABILITY_SEEDERS.map((seeder) => [
        capabilityKey(seeder.capability),
        newCounts(),
      ])
    );

    await runOnAllWorkspaces(
      async (workspace) => {
        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );

        const states = await GroupPermissionResource.getCapabilitiesState(
          auth,
          CAPABILITY_SEEDERS.map((seeder) => seeder.capability)
        );

        for (const seeder of CAPABILITY_SEEDERS) {
          const key = capabilityKey(seeder.capability);
          const counts = countsByCapability.get(key);
          if (!counts) {
            throw new Error(`Missing counters for capability ${key}.`);
          }

          const current = states.get(key);
          if (current && current.scope !== "admins_only") {
            counts.alreadySet++;
            continue;
          }

          const target = await seeder.resolveTarget(auth);
          const outcome = await applyCapabilityTarget(
            auth,
            seeder.capability,
            target,
            { dryRun: !execute }
          );

          logger.info(
            { workspaceId: workspace.sId, capability: key, target, outcome },
            execute ? "Applied." : "Would apply."
          );

          switch (outcome) {
            case "seeded_everybody":
              counts.seededEverybody++;
              break;
            case "seeded_builders":
              counts.seededBuilders++;
              break;
            case "skipped_admins_only":
              counts.skippedAdminsOnly++;
              break;
            default:
              assertNeverAndIgnore(outcome);
          }
        }
      },
      { wId }
    );

    logger.info(
      Object.fromEntries(countsByCapability),
      execute ? "Backfill completed." : "Dry run completed."
    );
  }
);
