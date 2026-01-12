import type { Client, WorkflowExecutionInfo } from "@temporalio/client";
import { defaultPayloadConverter } from "@temporalio/common";
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
  CheckActivityResult,
  CheckHistoryRun,
  CheckResultStatus,
  CheckSummaryStatus,
} from "@app/types";
import { assertNever } from "@app/types";

const COMPLETED_CHECKS_QUERY = `(WorkflowType = "${WORKFLOW_TYPE_RUN_ALL_CHECKS}" OR WorkflowType = "${WORKFLOW_TYPE_RUN_SINGLE_CHECK}") AND ExecutionStatus = "Completed"`;

const RUNNING_CHECKS_QUERY = `(WorkflowType = "${WORKFLOW_TYPE_RUN_ALL_CHECKS}" OR WorkflowType = "${WORKFLOW_TYPE_RUN_SINGLE_CHECK}") AND ExecutionStatus = "Running"`;

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

  const handle = client.workflow.getHandle(
    workflowInfo.workflowId,
    workflowInfo.runId
  );
  const history = await handle.fetchHistory();

  const results: CheckActivityResult[] = [];

  for (const event of history.events ?? []) {
    const payload =
      event.activityTaskCompletedEventAttributes?.result?.payloads?.[0];
    if (payload) {
      const decoded = defaultPayloadConverter.fromPayload<
        CheckActivityResult | CheckActivityResult[]
      >(payload);
      if (Array.isArray(decoded)) {
        results.push(
          ...decoded.filter((r): r is CheckActivityResult => r != null)
        );
      } else if (decoded) {
        results.push(decoded);
      }
    }
  }

  return results;
}

async function processBatch(
  client: Client,
  batch: WorkflowExecutionInfo[]
): Promise<
  { workflow: WorkflowExecutionInfo; checks: CheckActivityResult[] }[]
> {
  const results = await concurrentExecutor(
    batch,
    (wf) => getProductionCheckWorkflowResults(client, wf),
    { concurrency: 8 }
  );
  return batch.map((workflow, i) => ({ workflow, checks: results[i] }));
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
      for (const item of await processBatch(client, batch)) {
        yield item;
      }
      batch = [];
    }
  }

  if (batch.length > 0) {
    for (const item of await processBatch(client, batch)) {
      yield item;
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

async function getRunningWorkflowsForCheck(
  client: Client,
  checkName: string
): Promise<CheckHistoryRun[]> {
  const runs: CheckHistoryRun[] = [];

  for await (const workflow of client.workflow.list({
    query: RUNNING_CHECKS_QUERY,
    pageSize: WORKFLOW_LIST_BATCH_SIZE,
  })) {
    if (workflow.type === WORKFLOW_TYPE_RUN_SINGLE_CHECK) {
      const expectedPrefix = `${MANUAL_CHECK_WORKFLOW_ID_PREFIX}${checkName}_`;
      if (!workflow.workflowId.startsWith(expectedPrefix)) {
        continue;
      }
    }
    const isManual = workflow.workflowId.startsWith(
      MANUAL_CHECK_WORKFLOW_ID_PREFIX
    );
    runs.push({
      workflowId: workflow.workflowId,
      runId: workflow.runId ?? "",
      timestamp: workflow.startTime.toISOString(),
      status: "running",
      errorMessage: null,
      payload: null,
      actionLinks: [],
      workflowType: isManual ? "manual" : "scheduled",
    });
  }

  return runs;
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
  const runningWorkflows = await getRunningWorkflowsForCheck(client, checkName);

  const runs: CheckHistoryRun[] = [...runningWorkflows];
  const completedRunsLimit = runsLimit - runningWorkflows.length;

  if (completedRunsLimit <= 0) {
    return runs;
  }

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
