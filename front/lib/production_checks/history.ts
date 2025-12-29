import type { Client, WorkflowExecutionInfo } from "@temporalio/client";
import assert from "assert";

import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { REGISTERED_CHECKS } from "@app/temporal/production_checks/activities";
import {
  isProductionCheckWorkflowType,
  MANUAL_CHECK_WORKFLOW_ID_PREFIX,
  WORKFLOW_TYPE_RUN_ALL_CHECKS,
  WORKFLOW_TYPE_RUN_SINGLE_CHECK,
} from "@app/temporal/production_checks/config";
import type {
  runAllChecksWorkflow,
  runSingleCheckWorkflow,
} from "@app/temporal/production_checks/workflows";
import type {
  CheckActivityResult,
  CheckHistoryRun,
  CheckResultStatus,
  CheckSummaryStatus,
} from "@app/types";
import { assertNever } from "@app/types";

const COMPLETED_CHECKS_QUERY = `(WorkflowType = "${WORKFLOW_TYPE_RUN_ALL_CHECKS}" OR WorkflowType = "${WORKFLOW_TYPE_RUN_SINGLE_CHECK}") AND ExecutionStatus = "Completed"`;

const WORKFLOW_LIST_BATCH_SIZE = 50;
const DEFAULT_SEARCH_BREADTH = 200;
const DEFAULT_RUN_LIMIT = 10;

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
      assertNever(status);
  }
}

async function getProductionCheckWorkflowResults(
  client: Client,
  workflowInfo: WorkflowExecutionInfo
): Promise<CheckActivityResult[]> {
  assert(
    isProductionCheckWorkflowType(workflowInfo.type),
    `Unexpected workflow type: ${workflowInfo.type}`
  );

  switch (workflowInfo.type) {
    case WORKFLOW_TYPE_RUN_ALL_CHECKS: {
      const handle = client.workflow.getHandle<typeof runAllChecksWorkflow>(
        workflowInfo.workflowId,
        workflowInfo.runId
      );
      return handle.result();
    }
    case WORKFLOW_TYPE_RUN_SINGLE_CHECK: {
      const handle = client.workflow.getHandle<typeof runSingleCheckWorkflow>(
        workflowInfo.workflowId,
        workflowInfo.runId
      );
      const result = await handle.result();
      return [result];
    }
    default:
      assertNever(workflowInfo.type);
  }
}

async function* fetchWorkflowResultsBatched(client: Client): AsyncGenerator<{
  workflow: WorkflowExecutionInfo;
  checks: CheckActivityResult[];
}> {
  const workflowIterator = client.workflow.list({
    query: COMPLETED_CHECKS_QUERY,
    pageSize: WORKFLOW_LIST_BATCH_SIZE,
  });

  let batch: WorkflowExecutionInfo[] = [];

  for await (const workflowInfo of workflowIterator) {
    batch.push(workflowInfo);

    if (batch.length >= WORKFLOW_LIST_BATCH_SIZE) {
      const results = await concurrentExecutor(
        batch,
        (wf) => getProductionCheckWorkflowResults(client, wf),
        { concurrency: 8 }
      );

      for (let i = 0; i < batch.length; i++) {
        yield { workflow: batch[i], checks: results[i] };
      }
      batch = [];
    }
  }

  if (batch.length > 0) {
    const results = await concurrentExecutor(
      batch,
      (wf) => getProductionCheckWorkflowResults(client, wf),
      { concurrency: 8 }
    );

    for (let i = 0; i < batch.length; i++) {
      yield { workflow: batch[i], checks: results[i] };
    }
  }
}

export async function getLatestProductionCheckResults(
  client: Client,
  {
    searchBreadth = DEFAULT_SEARCH_BREADTH,
  }: {
    searchBreadth?: number;
  } = {}
): Promise<Map<string, CheckActivityResult>> {
  const checkResultsByName = new Map<string, CheckActivityResult>();
  const registeredCheckCount = REGISTERED_CHECKS.length;
  let processedCount = 0;

  for await (const { checks } of fetchWorkflowResultsBatched(client)) {
    processedCount++;

    for (const check of checks) {
      if (check.status === "skipped") {
        continue;
      }
      if (!checkResultsByName.has(check.checkName)) {
        checkResultsByName.set(check.checkName, check);
      }
    }

    if (checkResultsByName.size >= registeredCheckCount) {
      break;
    }

    if (processedCount >= searchBreadth) {
      logger.warn(
        {
          searchBreadth,
          foundChecks: checkResultsByName.size,
          registeredChecks: registeredCheckCount,
        },
        "Reached workflow limit before finding all registered checks"
      );
      break;
    }
  }

  return checkResultsByName;
}

export async function getProductionCheckHistory(
  client: Client,
  checkName: string,
  {
    runsLimit = DEFAULT_RUN_LIMIT,
    searchBreadth = DEFAULT_SEARCH_BREADTH,
  }: {
    runsLimit?: number;
    searchBreadth?: number;
  } = {}
): Promise<CheckHistoryRun[]> {
  const runs: CheckHistoryRun[] = [];
  let processedCount = 0;

  for await (const { workflow, checks } of fetchWorkflowResultsBatched(
    client
  )) {
    processedCount++;

    const checkResult = checks.find((c) => c.checkName === checkName);

    if (checkResult && checkResult.status !== "skipped") {
      const isManual = workflow.workflowId.startsWith(
        MANUAL_CHECK_WORKFLOW_ID_PREFIX
      );
      runs.push({
        workflowId: workflow.workflowId,
        runId: workflow.runId ?? "",
        timestamp: checkResult.timestamp,
        status: checkResult.status,
        errorMessage: checkResult.errorMessage,
        payload: checkResult.payload,
        actionLinks: checkResult.actionLinks,
        workflowType: isManual ? "manual" : "scheduled",
      });

      if (runs.length >= runsLimit) {
        break;
      }
    }

    if (processedCount >= searchBreadth) {
      logger.warn(
        {
          searchBreadth,
          foundRuns: runs.length,
          requestedRuns: runsLimit,
          checkName,
        },
        "Reached workflow limit before finding requested number of check runs"
      );
      break;
    }
  }

  return runs;
}
