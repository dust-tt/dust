import config from "@app/lib/api/config";
import { getFrontReplicaDbConnection } from "@app/lib/production_checks/utils";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ActionLink, CheckFunction } from "@app/types/production_checks";
import { QueryTypes } from "sequelize";

// Free (unbilled) usage is platform-assistive compute — sidekick, title
// generation, skill checks, etc. A workspace running far more free usage than
// its seat count can justify is a signal of abuse.
// We alert past $5 of free compute per active seat per day.
const PER_USER_DAILY_LIMIT_MICRO_USD = 5 * 1_000_000;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

interface WorkspaceFreeUsage {
  workspaceModelId: number;
  workspaceId: string;
  workspaceName: string;
  freeUsageMicroUsd: number;
}

export const checkExcessFreeUsage: CheckFunction = async (
  _checkName,
  logger,
  reportSuccess,
  reportFailure
) => {
  const frontDb = getFrontReplicaDbConnection();
  const lookbackStart = new Date(Date.now() - LOOKBACK_MS);

  // Per-workspace free usage over the last 24h. Pre-filter with the single-seat
  // limit ($5) as an absolute floor: every workspace has at least one seat, so a
  // workspace under $5 can never exceed its per-seat allowance and needn't have
  // its seat count fetched.
  const workspacesWithFreeUsage: WorkspaceFreeUsage[] =
    // biome-ignore lint/plugin/noRawSql: Production check using read replica
    await frontDb.query(
      `
      SELECT
        ru."workspaceId" as "workspaceModelId",
        w."sId" as "workspaceId",
        w."name" as "workspaceName",
        SUM(ru."costMicroUsd") as "freeUsageMicroUsd"
      FROM run_usages ru
      JOIN workspaces w ON ru."workspaceId" = w.id
      WHERE ru."usageType" = 'free'
        AND ru."createdAt" >= :lookbackStart
      GROUP BY ru."workspaceId", w."sId", w."name"
      HAVING SUM(ru."costMicroUsd") > :absoluteFloor
      ORDER BY SUM(ru."costMicroUsd") DESC
      `,
      {
        type: QueryTypes.SELECT,
        replacements: {
          lookbackStart: lookbackStart.toISOString(),
          absoluteFloor: PER_USER_DAILY_LIMIT_MICRO_USD,
        },
      }
    );

  if (workspacesWithFreeUsage.length === 0) {
    reportSuccess();
    return;
  }

  // Resolve the per-workspace allowance ($5 x active seats) only for candidates.
  const activeSeatsByWorkspaceId = new Map<string, number>();
  await concurrentExecutor(
    workspacesWithFreeUsage,
    async (workspace) => {
      const activeSeats = await MembershipResource.countActiveSeatsInWorkspace(
        workspace.workspaceId
      );
      activeSeatsByWorkspaceId.set(workspace.workspaceId, activeSeats);
    },
    { concurrency: 10 }
  );

  const offendingWorkspaces = workspacesWithFreeUsage.filter((w) => {
    const activeSeats = activeSeatsByWorkspaceId.get(w.workspaceId) ?? 1;
    const limitMicroUsd =
      PER_USER_DAILY_LIMIT_MICRO_USD * Math.max(activeSeats, 1);
    return Number(w.freeUsageMicroUsd) > limitMicroUsd;
  });

  if (offendingWorkspaces.length === 0) {
    reportSuccess();
    return;
  }

  const formattedWorkspaces = offendingWorkspaces.map((w) => {
    const activeSeats = activeSeatsByWorkspaceId.get(w.workspaceId) ?? 1;
    return {
      workspaceId: w.workspaceId,
      workspaceName: w.workspaceName,
      activeSeats,
      freeUsageUsd: (Number(w.freeUsageMicroUsd) / 1_000_000).toFixed(2),
      limitUsd: (
        (PER_USER_DAILY_LIMIT_MICRO_USD * Math.max(activeSeats, 1)) /
        1_000_000
      ).toFixed(2),
    };
  });

  const actionLinks: ActionLink[] = offendingWorkspaces.map((w) => ({
    label: `${w.workspaceName} ($${(Number(w.freeUsageMicroUsd) / 1_000_000).toFixed(2)})`,
    url: `${config.getPokeAppUrl()}/${w.workspaceId}`,
  }));

  const message =
    `${offendingWorkspaces.length} workspace(s) exceeded $5 of free usage ` +
    `per active seat in the last 24h`;

  logger.warn({ workspaces: formattedWorkspaces }, message);

  reportFailure({ workspaces: formattedWorkspaces, actionLinks }, message);
};
