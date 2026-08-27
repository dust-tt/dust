import type { CapabilitySeeder } from "@app/lib/api/permissions/governance_seeding";
import {
  applyCapabilityTarget,
  CAPABILITY_SEEDERS,
} from "@app/lib/api/permissions/governance_seeding";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import {
  capabilityKey,
  WHOLE_TYPE_RESOURCE_ID,
} from "@app/types/group_permissions";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Apply the `CAPABILITY_SEEDERS` registry to existing workspaces, for capabilities they have no
 * grant rows for yet. `seedWorkspaceCapabilities` only runs at workspace creation, so registering a
 * new capability leaves every existing workspace without it until this runs.
 *
 * Only untouched capabilities are seeded: a workspace whose state is already `everyone`, `groups`
 * or an explicit `admins_only` keeps it, so re-running never overwrites a manual configuration.
 * Note that "no rows" and "admins_only" are the same shape in the table, which is why the check
 * reads the rows directly instead of `getCapabilitiesState`.
 *
 * `--capability <grantType>:<resourceType>` names the capability to seed, e.g.
 * `--capability reader:skill`; it is required, and an unknown one is an error.
 */

const WORKSPACE_CONCURRENCY = 8;

async function seedWorkspaceMissingCapability(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType,
  seeder: CapabilitySeeder
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const existing = await GroupPermissionResource.listForResource(auth, {
    resourceType: seeder.capability.resourceType,
    resourceId: WHOLE_TYPE_RESOURCE_ID,
  });
  const alreadySet = existing.some(
    (grant) => grant.grantType === seeder.capability.grantType
  );
  if (alreadySet) {
    return;
  }

  const target = await seeder.resolveTarget(auth);

  if (!execute) {
    logger.info(
      {
        workspaceId: workspace.sId,
        capability: capabilityKey(seeder.capability),
        target,
      },
      "Dry run: would seed the capability"
    );
    return;
  }

  const outcome = await applyCapabilityTarget(auth, seeder.capability, target);
  logger.info(
    {
      workspaceId: workspace.sId,
      capability: capabilityKey(seeder.capability),
      target,
      outcome,
    },
    "Seeded the capability"
  );
}

makeScript(
  {
    wId: { type: "string", required: false },
    capability: { type: "string", required: true },
  },
  async ({ wId, capability, execute }, logger) => {
    // Fail on an unknown capability rather than filtering down to nothing and reporting a
    // successful run that seeded nobody.
    const seeder = CAPABILITY_SEEDERS.find(
      (candidate) => capabilityKey(candidate.capability) === capability
    );
    if (!seeder) {
      throw new Error(
        `Unknown capability "${capability}". Registered: ${CAPABILITY_SEEDERS.map(
          (candidate) => capabilityKey(candidate.capability)
        ).join(", ")}.`
      );
    }

    logger.info({ capability }, "Starting governance capability seeding");

    await runOnAllWorkspaces(
      async (workspace) => {
        await seedWorkspaceMissingCapability(
          execute,
          logger,
          workspace,
          seeder
        );
      },
      { concurrency: WORKSPACE_CONCURRENCY, wId }
    );

    logger.info("Governance capability seeding completed");
  }
);
