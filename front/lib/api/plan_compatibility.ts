import { getDataSources } from "@app/lib/api/data_sources";
import { countActiveSeatsForWorkspace } from "@app/lib/api/workspace_seats";
import type { Authenticator } from "@app/lib/auth";
import { doesConnectorProviderCountTowardConnectionsLimit } from "@app/lib/data_sources";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { PlanType } from "@app/types/plan";

type PlanFitResult = {
  fits: boolean;
  // Human-readable reasons the workspace exceeds the plan; empty when it fits.
  violations: string[];
};

/**
 * Check whether a workspace's current usage fits within a plan's restrictions —
 * used before migrating a workspace onto `plan` so the move does not leave it
 * over the new limits.
 *
 * Checks the scale limits that meaningfully tighten on a Pro → Business
 * migration: active seats, regular spaces, and data sources. A limit of -1
 * (unlimited) is never a violation. Feature gates (SSO/SCIM/audit logs) are
 * intentionally not checked here.
 */
export async function checkWorkspaceFitsPlanLimits(
  auth: Authenticator,
  plan: PlanType
): Promise<PlanFitResult> {
  const workspace = auth.getNonNullableWorkspace();
  const { limits } = plan;
  const violations: string[] = [];

  if (limits.users.maxUsers !== -1) {
    const activeSeats = await countActiveSeatsForWorkspace(workspace.sId);
    if (activeSeats > limits.users.maxUsers) {
      violations.push(
        `active seats (${activeSeats}) exceed plan maxUsers (${limits.users.maxUsers})`
      );
    }
  }

  if (limits.vaults.maxVaults !== -1) {
    const spaces = await SpaceResource.listWorkspaceSpaces(auth);
    const regularSpaceCount = spaces.filter((s) => s.kind === "regular").length;
    if (regularSpaceCount > limits.vaults.maxVaults) {
      violations.push(
        `regular spaces (${regularSpaceCount}) exceed plan maxVaults (${limits.vaults.maxVaults})`
      );
    }
  }

  if (limits.dataSources.count !== -1) {
    const dataSources = await getDataSources(auth);
    if (dataSources.length > limits.dataSources.count) {
      violations.push(
        `data sources (${dataSources.length}) exceed plan maxDataSourcesCount (${limits.dataSources.count})`
      );
    }
  }

  if (limits.connections.count !== -1) {
    const dataSources = await getDataSources(auth);
    const connectionsCount = dataSources.filter(
      (ds) =>
        ds.connectorProvider !== null &&
        doesConnectorProviderCountTowardConnectionsLimit(ds.connectorProvider)
    ).length;
    if (connectionsCount > limits.connections.count) {
      violations.push(
        `connected data sources (${connectionsCount}) exceed plan maxConnectionsCount (${limits.connections.count})`
      );
    }
  }

  return { fits: violations.length === 0, violations };
}
