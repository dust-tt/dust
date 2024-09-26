import { Context } from "@temporalio/activity";
import { v4 as uuidv4 } from "uuid";

import { checkActiveWorkflows } from "@app/lib/production_checks/checks/check_active_workflows_for_connectors";
import { checkConnectorsLastSyncSuccess } from "@app/lib/production_checks/checks/check_connectors_last_sync_success";
import { checkDataSourcesConsistency } from "@app/lib/production_checks/checks/check_data_sources_consistency";
import { checkNotionActiveWorkflows } from "@app/lib/production_checks/checks/check_notion_active_workflows";
import { managedDataSourceGCGdriveCheck } from "@app/lib/production_checks/checks/managed_data_source_gdrive_gc";
import { scrubDeletedCoreDocumentVersionsCheck } from "@app/lib/production_checks/checks/scrub_deleted_core_document_versions";
import type { Check } from "@app/lib/production_checks/types";
import mainLogger from "@app/logger/logger";

export async function runAllChecksActivity() {
  const checks: Check[] = [
    {
      name: "managed_data_source_gdrive_gc",
      check: managedDataSourceGCGdriveCheck,
      everyHour: 1,
    },
    {
      name: "scrub_deleted_core_document_versions",
      check: scrubDeletedCoreDocumentVersionsCheck,
      everyHour: 8,
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
      name: "check_connectors_last_sync_success",
      check: checkConnectorsLastSyncSuccess,
      everyHour: 1,
    },
    {
      name: "check_data_sources_consistency",
      check: checkDataSourcesConsistency,
      everyHour: 8,
    },
  ];
  await runAllChecks(checks);
}

async function runAllChecks(checks: Check[]) {
  const allCheckUuid = uuidv4();
  mainLogger.info({ all_check_uuid: allCheckUuid }, "Running all checks");
  for (const check of checks) {
    const uuid = uuidv4();
    const logger = mainLogger.child({
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
        Context.current().heartbeat({
          type: "skip",
          name: check.name,
          uuid: uuid,
        });
      } else {
        logger.info("Check starting");
        const reportSuccess = (reportPayload: unknown) => {
          logger.info({ reportPayload }, "Check succeeded");
        };
        const reportFailure = (reportPayload: unknown, message: string) => {
          logger.error(
            { reportPayload, errorMessage: message },
            "Production check failed"
          );
        };
        const heartbeat = async () => {
          return Context.current().heartbeat({
            type: "processing",
            name: check.name,
            uuid: uuid,
          });
        };
        Context.current().heartbeat({
          type: "start",
          name: check.name,
          uuid: uuid,
        });
        await check.check(
          check.name,
          logger,
          reportSuccess,
          reportFailure,
          heartbeat
        );
        Context.current().heartbeat({
          type: "finish",
          name: check.name,
          uuid: uuid,
        });

        logger.info("Check done");
      }
    } catch (e) {
      logger.error({ error: e }, "Production check failed");
    }
  }
  mainLogger.info({ uuid: allCheckUuid }, "Done running all checks");
}
