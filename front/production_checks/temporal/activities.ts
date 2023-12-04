import { Context } from "@temporalio/activity";
import { v4 as uuidv4 } from "uuid";

import mainLogger from "@app/logger/logger";
import { managedDataSourceGCGdriveCheck } from "@app/production_checks/checks/managed_data_source_gdrive_gc";
import { nangoConnectionIdCleanupSlack } from "@app/production_checks/checks/nango_connection_id_cleanup_slack";
import { scrubDeletedCoreDocumentVersionsCheck } from "@app/production_checks/checks/scrub_deleted_core_document_versions";
import { Check } from "@app/production_checks/types/check";

export async function runAllChecksActivity() {
  const checks: Check[] = [
    {
      name: "managed_data_source_gdrive_gc",
      check: managedDataSourceGCGdriveCheck,
      everyHour: 1,
    },
    {
      name: "nango_connection_id_cleanup_slack",
      check: nangoConnectionIdCleanupSlack,
      everyHour: 1,
    },
    {
      name: "scrub_deleted_core_document_versions",
      check: scrubDeletedCoreDocumentVersionsCheck,
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
        Context.current().heartbeat({
          type: "start",
          name: check.name,
          uuid: uuid,
        });
        await check.check(check.name, logger, reportSuccess, reportFailure);
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
