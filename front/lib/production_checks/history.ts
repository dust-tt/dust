import type { Client, WorkflowExecutionInfo } from "@temporalio/client";

import type {
  CheckActivityResult,
  CheckHistoryRun,
  CheckResultStatus,
  CheckSummaryStatus,
} from "@app/lib/production_checks/types";
import logger from "@app/logger/logger";
import type {
  runAllChecksWorkflow,
  runSingleCheckWorkflow,
} from "@app/temporal/production_checks/workflows";

const COMPLETED_CHECKS_QUERY = `(WorkflowType = "runAllChecksWorkflow" OR WorkflowType = "runSingleCheckWorkflow") AND ExecutionStatus = "Completed"`;

export function statusToSummaryStatus(
  status: CheckResultStatus
): CheckSummaryStatus {
  switch (status) {
    case "success":
    case "skipped":
      return "ok";
    case "failure":
      return "alert";
    case "running":
      return "ok";
    default:
      return "no-data";
  }
}

async function getWorkflowChecks(
  client: Client,
  workflowInfo: WorkflowExecutionInfo
): Promise<CheckActivityResult[]> {
  if (workflowInfo.type === "runAllChecksWorkflow") {
    const handle = client.workflow.getHandle<typeof runAllChecksWorkflow>(
      workflowInfo.workflowId,
      workflowInfo.runId
    );
    return handle.result();
  }

  const handle = client.workflow.getHandle<typeof runSingleCheckWorkflow>(
    workflowInfo.workflowId,
    workflowInfo.runId
  );
  const result = await handle.result();
  return [result];
}

export async function getLatestCheckResults(
  client: Client,
  limit: number = 20
): Promise<Map<string, CheckActivityResult>> {
  const workflowIterator = client.workflow.list({
    query: COMPLETED_CHECKS_QUERY,
  });

  const checkResultsByName = new Map<string, CheckActivityResult>();
  let processedCount = 0;

  for await (const workflowInfo of workflowIterator) {
    if (processedCount >= limit) {
      break;
    }

    try {
      const checks = await getWorkflowChecks(client, workflowInfo);

      for (const check of checks) {
        const existing = checkResultsByName.get(check.checkName);
        if (
          !existing ||
          new Date(check.timestamp) > new Date(existing.timestamp)
        ) {
          checkResultsByName.set(check.checkName, check);
        }
      }

      processedCount++;
    } catch (e) {
      logger.warn(
        { error: e, workflowId: workflowInfo.workflowId },
        "Failed to fetch workflow result"
      );
    }
  }

  return checkResultsByName;
}

export async function getCheckHistory(
  client: Client,
  checkName: string,
  limit: number
): Promise<CheckHistoryRun[]> {
  const workflowIterator = client.workflow.list({
    query: COMPLETED_CHECKS_QUERY,
  });

  const runs: CheckHistoryRun[] = [];

  for await (const workflowInfo of workflowIterator) {
    if (runs.length >= limit) {
      break;
    }

    try {
      const checks = await getWorkflowChecks(client, workflowInfo);
      const checkResult = checks.find((c) => c.checkName === checkName);

      if (checkResult) {
        const isManual = workflowInfo.workflowId.startsWith(
          "production_check_manual_"
        );

        runs.push({
          workflowId: workflowInfo.workflowId,
          runId: workflowInfo.runId ?? "",
          timestamp: checkResult.timestamp,
          status: checkResult.status,
          errorMessage: checkResult.errorMessage,
          payload: checkResult.payload,
          actionLinks: checkResult.actionLinks,
          workflowType: isManual ? "manual" : "scheduled",
        });
      }
    } catch (e) {
      logger.warn(
        { error: e, workflowId: workflowInfo.workflowId },
        "Failed to fetch workflow result for check"
      );
    }
  }

  runs.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return runs;
}
