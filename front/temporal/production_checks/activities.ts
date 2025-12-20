import { Context } from "@temporalio/activity";
import { v4 as uuidv4 } from "uuid";

import { checkActiveWorkflows } from "@app/lib/production_checks/checks/check_active_workflows_for_connectors";
import { checkActiveWorkflowsForFront } from "@app/lib/production_checks/checks/check_active_workflows_for_front";
import { checkConnectorsLastSyncSuccess } from "@app/lib/production_checks/checks/check_connectors_last_sync_success";
import { checkDataSourcesConsistency } from "@app/lib/production_checks/checks/check_data_sources_consistency";
import { checkExcessCredits } from "@app/lib/production_checks/checks/check_excess_credits";
import { checkExtraneousWorkflows } from "@app/lib/production_checks/checks/check_extraneous_workflows_for_paused_connectors";
import { checkNotionActiveWorkflows } from "@app/lib/production_checks/checks/check_notion_active_workflows";
import { checkPausedConnectors } from "@app/lib/production_checks/checks/check_paused_connectors";
import { checkWebcrawlerSchedulerActiveWorkflow } from "@app/lib/production_checks/checks/check_webcrawler_scheduler_active_workflow";
import { managedDataSourceGCGdriveCheck } from "@app/lib/production_checks/checks/managed_data_source_gdrive_gc";
import type {
  ActionLink,
  Check,
  CheckActivityResult,
  CheckHeartbeat,
} from "@app/lib/production_checks/types";
import mainLogger from "@app/logger/logger";

function extractActionLinks(payload: unknown): ActionLink[] {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "actionLinks" in payload &&
    Array.isArray((payload as { actionLinks: unknown }).actionLinks)
  ) {
    return (payload as { actionLinks: ActionLink[] }).actionLinks;
  }
  return [];
}

export const REGISTERED_CHECKS: Check[] = [
  {
    name: "managed_data_source_gdrive_gc",
    check: managedDataSourceGCGdriveCheck,
    everyHour: 4,
  },
  {
    name: "check_notion_active_workflows",
    check: checkNotionActiveWorkflows,
    everyHour: 1,
  },
  {
    name: "check_active_workflows_for_connector",
    check: checkActiveWorkflows,
    everyHour: 1,
  },
  {
    name: "check_active_workflows_for_front",
    check: checkActiveWorkflowsForFront,
    everyHour: 8,
  },
  {
    name: "check_extraneous_workflows_for_paused_connectors",
    check: checkExtraneousWorkflows,
    everyHour: 1,
  },
  {
    name: "check_connectors_last_sync_success",
    check: checkConnectorsLastSyncSuccess,
    everyHour: 1,
  },
  {
    name: "check_data_sources_consistency",
    check: checkDataSourcesConsistency,
    everyHour: 8,
  },
  {
    name: "check_webcrawler_scheduler_active_workflow",
    check: checkWebcrawlerSchedulerActiveWorkflow,
    everyHour: 8,
  },
  {
    name: "checked_paused_connectors",
    check: checkPausedConnectors,
    everyHour: 8,
  },
  {
    name: "check_excess_credits",
    check: checkExcessCredits,
    everyHour: 24,
  },
];

export async function runAllChecksActivity(): Promise<CheckActivityResult[]> {
  return runAllChecks(REGISTERED_CHECKS);
}

async function runAllChecks(checks: Check[]): Promise<CheckActivityResult[]> {
  const allCheckUuid = uuidv4();
  const results: CheckActivityResult[] = [];
  mainLogger.info({ all_check_uuid: allCheckUuid }, "Running all checks");

  for (const check of checks) {
    const uuid = uuidv4();
    const logger = mainLogger.child({
      all_check_uuid: allCheckUuid,
      checkName: check.name,
      uuid,
    });
    try {
      const currentHour = new Date().getHours();
      if (currentHour % check.everyHour !== 0) {
        logger.info("Check skipped", {
          currentHour,
          everyHour: check.everyHour,
        });
        const skipHeartbeat: CheckHeartbeat = {
          type: "skip",
          name: check.name,
          uuid: uuid,
        };
        Context.current().heartbeat(skipHeartbeat);

        results.push({
          checkName: check.name,
          status: "skipped",
          timestamp: new Date().toISOString(),
          payload: null,
          errorMessage: null,
          actionLinks: [],
        });
      } else {
        logger.info("Check starting");
        let checkSucceeded = false;
        let lastPayload: unknown = null;
        let lastErrorMessage: string | null = null;

        const reportSuccess = (reportPayload: unknown) => {
          logger.info({ reportPayload }, "Check succeeded");
          checkSucceeded = true;
          lastPayload = reportPayload;
        };
        const reportFailure = (reportPayload: unknown, message: string) => {
          logger.error(
            { reportPayload, errorMessage: message },
            "Production check failed"
          );
          checkSucceeded = false;
          lastPayload = reportPayload;
          lastErrorMessage = message;
        };
        const heartbeat = async () => {
          const processingHeartbeat: CheckHeartbeat = {
            type: "processing",
            name: check.name,
            uuid: uuid,
          };
          return Context.current().heartbeat(processingHeartbeat);
        };
        const startHeartbeat: CheckHeartbeat = {
          type: "start",
          name: check.name,
          uuid: uuid,
        };
        Context.current().heartbeat(startHeartbeat);
        await check.check(
          check.name,
          logger,
          reportSuccess,
          reportFailure,
          heartbeat
        );

        const resultHeartbeat: CheckHeartbeat = {
          type: checkSucceeded ? "success" : "failure",
          name: check.name,
          uuid: uuid,
        };
        Context.current().heartbeat(resultHeartbeat);

        const finishHeartbeat: CheckHeartbeat = {
          type: "finish",
          name: check.name,
          uuid: uuid,
        };
        Context.current().heartbeat(finishHeartbeat);

        results.push({
          checkName: check.name,
          status: checkSucceeded ? "success" : "failure",
          timestamp: new Date().toISOString(),
          payload: lastPayload,
          errorMessage: lastErrorMessage,
          actionLinks: extractActionLinks(lastPayload),
        });

        logger.info("Check done");
      }
    } catch (e) {
      logger.error({ error: e }, "Production check failed");
      results.push({
        checkName: check.name,
        status: "failure",
        timestamp: new Date().toISOString(),
        payload: null,
        errorMessage: e instanceof Error ? e.message : "Unknown error",
        actionLinks: [],
      });
    }
  }
  mainLogger.info({ all_check_uuid: allCheckUuid }, "Done running all checks");
  return results;
}

export async function runSingleCheckActivity(
  checkName: string
): Promise<CheckActivityResult> {
  const check = REGISTERED_CHECKS.find((c) => c.name === checkName);
  if (!check) {
    throw new Error(`Check not found: ${checkName}`);
  }

  const uuid = uuidv4();
  const logger = mainLogger.child({
    checkName: check.name,
    uuid,
    manualRun: true,
  });

  logger.info("Manual check starting");

  let checkSucceeded = false;
  let lastPayload: unknown = null;
  let lastErrorMessage: string | null = null;

  const reportSuccess = (reportPayload: unknown) => {
    logger.info({ reportPayload }, "Check succeeded");
    checkSucceeded = true;
    lastPayload = reportPayload;
  };

  const reportFailure = (reportPayload: unknown, message: string) => {
    logger.error(
      { reportPayload, errorMessage: message },
      "Production check failed"
    );
    checkSucceeded = false;
    lastPayload = reportPayload;
    lastErrorMessage = message;
  };

  const heartbeat = async () => {
    const processingHeartbeat: CheckHeartbeat = {
      type: "processing",
      name: check.name,
      uuid: uuid,
    };
    return Context.current().heartbeat(processingHeartbeat);
  };

  const startHeartbeat: CheckHeartbeat = {
    type: "start",
    name: check.name,
    uuid: uuid,
  };
  Context.current().heartbeat(startHeartbeat);

  await check.check(
    check.name,
    logger,
    reportSuccess,
    reportFailure,
    heartbeat
  );

  const resultHeartbeat: CheckHeartbeat = {
    type: checkSucceeded ? "success" : "failure",
    name: check.name,
    uuid: uuid,
  };
  Context.current().heartbeat(resultHeartbeat);

  const finishHeartbeat: CheckHeartbeat = {
    type: "finish",
    name: check.name,
    uuid: uuid,
  };
  Context.current().heartbeat(finishHeartbeat);

  logger.info("Manual check done");

  return {
    checkName: check.name,
    status: checkSucceeded ? "success" : "failure",
    timestamp: new Date().toISOString(),
    payload: lastPayload,
    errorMessage: lastErrorMessage,
    actionLinks: extractActionLinks(lastPayload),
  };
}
