import { checkActiveWorkflows } from "@app/lib/production_checks/checks/check_active_workflows_for_connectors";
import { checkActiveWorkflowsForFront } from "@app/lib/production_checks/checks/check_active_workflows_for_front";
import { checkConnectorsLastSyncSuccess } from "@app/lib/production_checks/checks/check_connectors_last_sync_success";
import { checkDataSourcesConsistency } from "@app/lib/production_checks/checks/check_data_sources_consistency";
import { checkEndedBackendOnlySubscriptions } from "@app/lib/production_checks/checks/check_ended_backend_only_subscriptions";
import { checkExcessCredits } from "@app/lib/production_checks/checks/check_excess_credits";
import { checkExtraneousWorkflows } from "@app/lib/production_checks/checks/check_extraneous_workflows_for_paused_connectors";

import { checkNotionActiveWorkflows } from "@app/lib/production_checks/checks/check_notion_active_workflows";
import { checkPausedConnectors } from "@app/lib/production_checks/checks/check_paused_connectors";
import { checkWebcrawlerSchedulerActiveWorkflow } from "@app/lib/production_checks/checks/check_webcrawler_scheduler_active_workflow";
import { managedDataSourceGCGdriveCheck } from "@app/lib/production_checks/checks/managed_data_source_gdrive_gc";
import mainLogger from "@app/logger/logger";
import type {
  ActionLink,
  Check,
  CheckActivityResult,
  CheckFailurePayload,
  CheckHeartbeat,
  CheckSuccessPayload,
} from "@app/types/production_checks";
import { CheckHeartbeatDetailsSchema } from "@app/types/production_checks";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { activityInfo, heartbeat } from "@temporalio/activity";
import { v4 as uuidv4 } from "uuid";

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
  {
    name: "check_ended_backend_only_subscriptions",
    check: checkEndedBackendOnlySubscriptions,
    everyHour: 24,
  },
];

export async function runAllChecksActivity(): Promise<CheckActivityResult[]> {
  return runAllChecks(REGISTERED_CHECKS);
}

function getResultsFromHeartbeatDetails(
  heartbeatDetails: unknown,
): CheckActivityResult[] {
  const parsedHeartbeatDetails =
    CheckHeartbeatDetailsSchema.safeParse(heartbeatDetails);

  return parsedHeartbeatDetails.success
    ? parsedHeartbeatDetails.data.results
    : [];
}

function sendCheckHeartbeat(
  heartbeatData: CheckHeartbeat,
  {
    results,
  }: {
    results: CheckActivityResult[];
  },
) {
  heartbeat({
    ...heartbeatData,
    results: [...results],
  });
}

async function runAllChecks(checks: Check[]): Promise<CheckActivityResult[]> {
  const allCheckUuid = uuidv4();
  const results = getResultsFromHeartbeatDetails(
    activityInfo().heartbeatDetails,
  );
  const currentHour = new Date().getHours();
  const previouslyCompletedCheckNames = new Set(
    results.map((result) => result.checkName),
  );

  mainLogger.info(
    {
      all_check_uuid: allCheckUuid,
      resumingFrom: results.length > 0 ? results.length : undefined,
      currentHour,
    },
    "Running all checks",
  );

  for (const check of checks) {
    if (previouslyCompletedCheckNames.has(check.name)) {
      mainLogger.info(
        {
          all_check_uuid: allCheckUuid,
          checkName: check.name,
        },
        "Check already completed in previous attempt, skipping",
      );
      continue;
    }

    const uuid = uuidv4();
    const logger = mainLogger.child({
      all_check_uuid: allCheckUuid,
      checkName: check.name,
      uuid,
    });

    try {
      if (currentHour % check.everyHour !== 0) {
        logger.info("Check skipped", {
          currentHour,
          everyHour: check.everyHour,
        });

        results.push({
          checkName: check.name,
          status: "skipped",
          timestamp: new Date().toISOString(),
          payload: null,
          errorMessage: null,
          actionLinks: [],
        });

        sendCheckHeartbeat(
          { type: "skip", name: check.name, uuid },
          { results },
        );

        continue;
      }

      logger.info("Check starting");

      let checkSucceeded = true;
      let lastSuccessPayload: CheckSuccessPayload | undefined;
      const errorMessages: string[] = [];
      const allActionLinks: ActionLink[] = [];
      const allFailurePayloads: CheckFailurePayload[] = [];

      const reportSuccess = (payload?: CheckSuccessPayload) => {
        logger.info({ payload }, "Check succeeded");
        lastSuccessPayload = payload;
      };
      const reportFailure = (payload: CheckFailurePayload, message: string) => {
        logger.error(
          { payload, errorMessage: message },
          "Production check failed",
        );
        checkSucceeded = false;
        allFailurePayloads.push({ ...payload, errorMessage: message });
        errorMessages.push(message);
        allActionLinks.push(...(payload.actionLinks ?? []));
      };

      sendCheckHeartbeat(
        { type: "start", name: check.name, uuid },
        { results },
      );

      await check.check(
        check.name,
        logger,
        reportSuccess,
        reportFailure,
        async () =>
          sendCheckHeartbeat(
            { type: "processing", name: check.name, uuid },
            { results },
          ),
      );

      logger.info("Check done");

      const result: CheckActivityResult = {
        checkName: check.name,
        status: checkSucceeded ? "success" : "failure",
        timestamp: new Date().toISOString(),
        payload: checkSucceeded
          ? (lastSuccessPayload ?? null)
          : allFailurePayloads.length > 0
            ? allFailurePayloads
            : null,
        errorMessage:
          errorMessages.length > 0
            ? [...new Set(errorMessages)].join("; ")
            : null,
        actionLinks: allActionLinks,
      };
      results.push(result);

      sendCheckHeartbeat(
        {
          type: checkSucceeded ? "success" : "failure",
          name: check.name,
          uuid,
        },
        { results },
      );
    } catch (error) {
      logger.error({ error }, "Production check failed");

      results.push({
        checkName: check.name,
        status: "failure",
        timestamp: new Date().toISOString(),
        payload: null,
        errorMessage: normalizeError(error).message,
        actionLinks: [],
      });

      sendCheckHeartbeat(
        { type: "failure", name: check.name, uuid },
        { results },
      );
    }
  }
  mainLogger.info({ all_check_uuid: allCheckUuid }, "Done running all checks");

  return results;
}

export async function runSingleCheckActivity(
  checkName: string,
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

  let checkSucceeded = true;
  let lastSuccessPayload: CheckSuccessPayload | undefined;
  const errorMessages: string[] = [];
  const allActionLinks: ActionLink[] = [];
  const allFailurePayloads: CheckFailurePayload[] = [];

  const reportSuccess = (payload?: CheckSuccessPayload) => {
    logger.info({ payload }, "Check succeeded");
    lastSuccessPayload = payload;
  };

  const reportFailure = (payload: CheckFailurePayload, message: string) => {
    logger.error({ payload, errorMessage: message }, "Production check failed");
    checkSucceeded = false;
    allFailurePayloads.push({ ...payload, errorMessage: message });
    errorMessages.push(message);
    allActionLinks.push(...(payload.actionLinks ?? []));
  };

  heartbeat({ type: "start", name: check.name, uuid });

  await check.check(
    check.name,
    logger,
    reportSuccess,
    reportFailure,
    async () =>
      heartbeat({
        type: "processing",
        name: check.name,
        uuid,
      }),
  );

  heartbeat({
    type: checkSucceeded ? "success" : "failure",
    name: check.name,
    uuid,
  });
  heartbeat({ type: "finish", name: check.name, uuid });

  logger.info("Manual check done");

  return {
    checkName: check.name,
    status: checkSucceeded ? "success" : "failure",
    timestamp: new Date().toISOString(),
    payload: checkSucceeded
      ? (lastSuccessPayload ?? null)
      : allFailurePayloads.length > 0
        ? allFailurePayloads
        : null,
    errorMessage:
      errorMessages.length > 0 ? [...new Set(errorMessages)].join("; ") : null,
    actionLinks: allActionLinks,
  };
}
