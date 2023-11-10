import { Context } from "@temporalio/activity";
import { v4 as uuidv4 } from "uuid";

import mainLogger from "@app/logger/logger";
import { mySuperCheck } from "@app/production_checks/checks/super_check";
import { Check } from "@app/production_checks/types/check";

export async function runAllChecksActivity() {
  const checks: Check[] = [
    {
      name: "mySuperCheck",
      check: mySuperCheck,
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
        logger.error({ reportPayload, errorMessage: message }, "Check failed");
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
