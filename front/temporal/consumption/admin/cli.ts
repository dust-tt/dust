import logger from "@app/logger/logger";
import {
  createOrUpdateConsumptionEventsCleanupSchedule,
  createOrUpdateConsumptionEventsRecoverySchedule,
} from "@app/temporal/consumption/client";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import parseArgs from "minimist";

async function main(): Promise<void> {
  const [command] = parseArgs(process.argv.slice(2))._;
  switch (command) {
    case "start-cleanup-schedule": {
      const result = await createOrUpdateConsumptionEventsCleanupSchedule();
      if (result.isErr()) {
        throw result.error;
      }
      return;
    }
    case "start-recovery-schedule": {
      const result = await createOrUpdateConsumptionEventsRecoverySchedule();
      if (result.isErr()) {
        throw result.error;
      }
      return;
    }
    case "start-schedules": {
      const cleanup = await createOrUpdateConsumptionEventsCleanupSchedule();
      if (cleanup.isErr()) {
        throw cleanup.error;
      }
      const recovery = await createOrUpdateConsumptionEventsRecoverySchedule();
      if (recovery.isErr()) {
        throw recovery.error;
      }
      return;
    }
    default:
      throw new Error(
        "Expected command: start-cleanup-schedule, start-recovery-schedule, or start-schedules"
      );
  }
}

void main().catch((err) => {
  logger.error(
    { err: normalizeError(err) },
    "[Consumption] Admin command failed."
  );
  process.exit(1);
});
