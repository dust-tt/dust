import { Context } from "@temporalio/activity";
import { v4 as uuidv4 } from "uuid";

import mainLogger from "@app/logger/logger";
import { managedDataSourceGCGdriveCheck } from "@app/production_checks/checks/managed_data_source_gdrive_gc";
import { nangoConnectionIdCleanupSlack } from "@app/production_checks/checks/nango_connection_id_cleanup_slack";
import { Check } from "@app/production_checks/types/check";

export async function runAllChecksActivity() {
  const checks: Check[] = [
    {
      name: "managed_data_source_gdrive_gc",
      check: managedDataSourceGCGdriveCheck,
    },
    {
      name: "nango_connection_id_cleanup_slack",
      check: nangoConnectionIdCleanupSlack,
    },
  ];
  await runAllChecks(checks);
}

async function runAllChecks(checks: Check[]) {
  const allCheckUuid = uuidv4();
  mainLogger.info({ uuid: allCheckUuid }, "Running all checks");
  for (const check of checks) {
    const uuid = uuidv4();
    const logger = mainLogger.child({
      name: check.name,
      uuid,
    });
    try {
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
      await check.check(check.name, reportSuccess, reportFailure);
      Context.current().heartbeat({
        type: "finish",
        name: check.name,
        uuid: uuid,
      });

      logger.info("Check done");
    } catch (e) {
      logger.error({ error: e }, "Check failed");
    }
  }
  mainLogger.info({ uuid: allCheckUuid }, "Done running all checks");
}
