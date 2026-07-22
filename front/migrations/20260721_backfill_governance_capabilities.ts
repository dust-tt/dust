import {
  applyCapabilityTarget,
  CAPABILITY_SEEDERS,
  resolveEffectiveTarget,
} from "@app/lib/api/permissions/governance_seeding";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { CapabilityKey } from "@app/types/group_permissions";
import { capabilityKey } from "@app/types/group_permissions";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";

interface SeederCounts {
  seededEverybody: number;
  seededBuilders: number;
  seededAdminsOnly: number;
  alreadyEverybody: number;
  alreadyBuilders: number;
  alreadyAdminsOnly: number;
}

function newCounts(): SeederCounts {
  return {
    seededEverybody: 0,
    seededBuilders: 0,
    seededAdminsOnly: 0,
    alreadyEverybody: 0,
    alreadyBuilders: 0,
    alreadyAdminsOnly: 0,
  };
}

const WORKSPACE_CONCURRENCY = 4;

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
 * registry to brand-new workspaces at creation time (dust-tt/tasks#9454). This script adds what a
 * one-time backfill needs on top: it resolves the effective target up front (via
 * `resolveEffectiveTarget`) so it can decide, per workspace, whether to preserve an existing
 * manual configuration, actively revert to admins_only, or apply a fresh grant — plus the
 * dry-run/--execute gating.
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
        // Fetched once per workspace (not per capability) for the "is this recognizably our own
        // seeded output" check below.
        const buildersGroup = await GroupResource.fetchManualBuildersGroup(
          auth.getNonNullableWorkspace()
        );

        for (const seeder of CAPABILITY_SEEDERS) {
          const key = capabilityKey(seeder.capability);
          const counts = countsByCapability.get(key);
          if (!counts) {
            throw new Error(`Missing counters for capability ${key}.`);
          }

          const target = await seeder.resolveTarget(auth);
          const effectiveTarget = await resolveEffectiveTarget(auth, target);

          const current = states.get(key);

          if (effectiveTarget === "admins_only") {
            if (!current || current.scope === "admins_only") {
              // Already the default state; nothing to do.
              counts.alreadyAdminsOnly++;
              continue;
            }

            // Legacy state no longer grants this capability (e.g. the flag got enabled, or the
            // Builders group disappeared, since an earlier run) — actively revert, unlike the
            // "everyone"/"builders" branch below, which preserves any existing configuration.
            logger.info(
              {
                workspaceId: workspace.sId,
                capability: key,
                previousScope: current?.scope,
              },
              execute
                ? "Reverting to admins_only."
                : "Would revert to admins_only."
            );
            if (execute) {
              await GroupPermissionResource.disable(auth, seeder.capability);
            }
            counts.seededAdminsOnly++;
            continue;
          }

          if (effectiveTarget === "builders") {
            const isRecognizedBuildersState =
              current &&
              current.scope === "groups" &&
              !!buildersGroup &&
              current.groups.length === 1 &&
              current.groups[0].id === buildersGroup.id;

            if (isRecognizedBuildersState) {
              counts.alreadyBuilders++;
              continue;
            }
          }

          if (effectiveTarget === "everyone") {
            if (current && current.scope === "everyone") {
              counts.alreadyEverybody++;
              continue;
            }
          }

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
            case "skipped_no_builders_group":
              // Does not happen, handled in effectiveTarget === "admins_only"
              break;
            default:
              assertNeverAndIgnore(outcome);
          }
        }
      },
      { wId, concurrency: WORKSPACE_CONCURRENCY }
    );

    logger.info(
      Object.fromEntries(countsByCapability),
      execute ? "Backfill completed." : "Dry run completed."
    );
  }
);
