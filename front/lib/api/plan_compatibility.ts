import { getDataSources } from "@app/lib/api/data_sources";
import { countActiveSeatsForWorkspace } from "@app/lib/api/workspace_seats";
import type { Authenticator } from "@app/lib/auth";
import { doesConnectorProviderCountTowardConnectionsLimit } from "@app/lib/data_sources";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
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
 *
 * The workspace's plan-limit overrides apply to `plan` as well (they are
 * workspace-scoped, not plan-scoped), so every overridable limit is checked
 * against its effective value.
 */
export async function checkWorkspaceFitsPlanLimits(
  auth: Authenticator,
  plan: PlanType
): Promise<PlanFitResult> {
  const workspace = auth.getNonNullableWorkspace();
  const { limits } = plan;
  const violations: string[] = [];

  const planLimitOverride = await WorkspaceResource.fetchPlanLimitOverride(
    workspace.id
  );
  const maxUsers =
    planLimitOverride?.maxUsersInWorkspace ?? limits.users.maxUsers;
  const maxVaults =
    planLimitOverride?.maxVaultsInWorkspace ?? limits.vaults.maxVaults;
  const maxDataSourcesCount =
    planLimitOverride?.maxDataSourcesCount ?? limits.dataSources.count;
  const maxConnectionsCount =
    planLimitOverride?.maxConnectionsCount ?? limits.connections.count;

  if (maxUsers !== -1) {
    const activeSeats = await countActiveSeatsForWorkspace(workspace.sId);
    if (activeSeats > maxUsers) {
      violations.push(
        `active seats (${activeSeats}) exceed plan maxUsers (${maxUsers})`
      );
    }
  }

  if (maxVaults !== -1) {
    const spaces = await SpaceResource.listWorkspaceSpaces(auth);
    const regularSpaceCount = spaces.filter((s) => s.kind === "regular").length;
    if (regularSpaceCount > maxVaults) {
      violations.push(
        `regular spaces (${regularSpaceCount}) exceed plan maxVaults (${maxVaults})`
      );
    }
  }

  if (maxDataSourcesCount !== -1) {
    const dataSources = await getDataSources(auth);
    if (dataSources.length > maxDataSourcesCount) {
      violations.push(
        `data sources (${dataSources.length}) exceed plan maxDataSourcesCount (${maxDataSourcesCount})`
      );
    }
  }

  if (maxConnectionsCount !== -1) {
    const dataSources = await getDataSources(auth);
    const connectionsCount = dataSources.filter(
      (ds) =>
        ds.connectorProvider !== null &&
        doesConnectorProviderCountTowardConnectionsLimit(ds.connectorProvider)
    ).length;
    if (connectionsCount > maxConnectionsCount) {
      violations.push(
        `connected data sources (${connectionsCount}) exceed plan maxConnectionsCount (${maxConnectionsCount})`
      );
    }
  }

  return { fits: violations.length === 0, violations };
}
