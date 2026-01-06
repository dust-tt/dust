// Temporal server subcommands: start, stop, restart

import { logger } from "../lib/logger";
import { TEMPORAL_PORT } from "../lib/paths";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import {
  isTemporalServerRunning,
  restartTemporalServer,
  startTemporalServer,
  stopTemporalServer,
} from "../lib/temporal-server";

export async function temporalStartCommand(): Promise<Result<void>> {
  logger.step("Starting Temporal server...");

  const result = await startTemporalServer();

  if (!result.success) {
    return Err(new CommandError(result.error ?? "Failed to start Temporal server"));
  }

  logger.success(`Temporal server running on port ${TEMPORAL_PORT} (PID: ${result.pid})`);
  return Ok(undefined);
}

export async function temporalStopCommand(): Promise<Result<void>> {
  logger.step("Stopping Temporal server...");

  const result = await stopTemporalServer();

  if (result.wasRunning) {
    logger.success("Temporal server stopped");
  } else {
    logger.info("Temporal server was not running");
  }

  return Ok(undefined);
}

export async function temporalRestartCommand(): Promise<Result<void>> {
  logger.step("Restarting Temporal server...");

  const result = await restartTemporalServer();

  if (!result.success) {
    return Err(new CommandError(result.error ?? "Failed to restart Temporal server"));
  }

  logger.success(`Temporal server restarted (PID: ${result.pid})`);
  return Ok(undefined);
}

export async function temporalStatusCommand(): Promise<Result<void>> {
  const status = await isTemporalServerRunning();

  if (!status.running) {
    logger.info("Temporal server is not running");
  } else if (status.managed) {
    logger.info(`Temporal server running (managed, PID: ${status.pid})`);
  } else {
    logger.warn(
      `Temporal server running externally on port ${TEMPORAL_PORT} (not managed by dust-hive)`
    );
  }

  return Ok(undefined);
}
