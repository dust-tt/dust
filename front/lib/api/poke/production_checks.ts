import {
  getLatestProductionCheckResults,
  getProductionCheckHistory,
  statusToSummaryStatus,
} from "@app/lib/production_checks/history";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import { REGISTERED_CHECKS } from "@app/temporal/production_checks/activities";
import type {
  Check,
  CheckHistoryRun,
  CheckSummary,
  CheckSummaryStatus,
} from "@app/types";

export function getRegisteredCheck(checkName: string): Check | null {
  return REGISTERED_CHECKS.find((c) => c.name === checkName) ?? null;
}

export async function getCheckSummaries(): Promise<CheckSummary[]> {
  const client = await getTemporalClientForFrontNamespace();
  const checkResultsByName = await getLatestProductionCheckResults(client);

  const checks: CheckSummary[] = REGISTERED_CHECKS.map((registeredCheck) => {
    const latestResult = checkResultsByName.get(registeredCheck.name);

    if (!latestResult) {
      return {
        name: registeredCheck.name,
        everyHour: registeredCheck.everyHour,
        status: "no-data" as const,
        lastRun: null,
      };
    }

    return {
      name: registeredCheck.name,
      everyHour: registeredCheck.everyHour,
      status: statusToSummaryStatus(latestResult.status),
      lastRun: {
        timestamp: latestResult.timestamp,
        errorMessage: latestResult.errorMessage,
        payload: latestResult.payload,
        actionLinks: latestResult.actionLinks,
      },
    };
  });

  const statusOrder: Record<CheckSummaryStatus, number> = {
    alert: 0,
    ok: 1,
    "no-data": 2,
  };
  checks.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  return checks;
}

export async function getCheckHistoryRuns(
  checkName: string
): Promise<CheckHistoryRun[]> {
  const client = await getTemporalClientForFrontNamespace();
  return getProductionCheckHistory(client, checkName);
}
