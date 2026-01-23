// Temporal server subcommands: start, stop, restart, status, logs

import { logger } from "../lib/logger";
import { TEMPORAL_LOG_PATH, TEMPORAL_PORT } from "../lib/paths";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import {
  isTemporalServerRunning,
  restartTemporalServer,
  startTemporalServer,
  stopTemporalServer,
} from "../lib/temporal-server";

async function temporalStart(): Promise<Result<void>> {
  logger.step("Starting Temporal server...");

  const result = await startTemporalServer();

  if (!result.success) {
    return Err(new CommandError(result.error ?? "Failed to start Temporal server"));
  }

  logger.success(`Temporal server running on port ${TEMPORAL_PORT} (PID: ${result.pid})`);
  return Ok(undefined);
}

async function temporalStop(): Promise<Result<void>> {
  logger.step("Stopping Temporal server...");

  const result = await stopTemporalServer();

  if (result.wasRunning) {
    logger.success("Temporal server stopped");
  } else {
    logger.info("Temporal server was not running");
  }

  return Ok(undefined);
}

async function temporalRestart(): Promise<Result<void>> {
  logger.step("Restarting Temporal server...");

  const result = await restartTemporalServer();

  if (!result.success) {
    return Err(new CommandError(result.error ?? "Failed to restart Temporal server"));
  }

  logger.success(`Temporal server restarted (PID: ${result.pid})`);
  return Ok(undefined);
}

async function temporalStatus(): Promise<Result<void>> {
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

async function temporalLogs(): Promise<Result<void>> {
  const logFile = Bun.file(TEMPORAL_LOG_PATH);
  if (!(await logFile.exists())) {
    return Err(new CommandError("No temporal log file found. Is temporal running?"));
  }

  const proc = Bun.spawn(["tail", "-n", "500", "-F", TEMPORAL_LOG_PATH], {
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;

  return Ok(undefined);
}

const TEMPORAL_SUBCOMMANDS = ["start", "stop", "restart", "status", "logs"] as const;
type TemporalSubcommand = (typeof TEMPORAL_SUBCOMMANDS)[number];

function isValidSubcommand(cmd: string): cmd is TemporalSubcommand {
  return TEMPORAL_SUBCOMMANDS.includes(cmd as TemporalSubcommand);
}

export async function temporalCommand(subcommand: string | undefined): Promise<Result<void>> {
  if (!subcommand) {
    logger.info("Usage: dust-hive temporal <start|stop|restart|status|logs>");
    logger.info("");
    logger.info("Subcommands:");
    logger.info("  start    Start Temporal server");
    logger.info("  stop     Stop Temporal server");
    logger.info("  restart  Restart Temporal server");
    logger.info("  status   Show Temporal server status");
    logger.info("  logs     Follow Temporal server logs");
    return Ok(undefined);
  }

  if (!isValidSubcommand(subcommand)) {
    return Err(
      new CommandError(
        `Unknown temporal subcommand: ${subcommand}. Valid subcommands: ${TEMPORAL_SUBCOMMANDS.join(", ")}`
      )
    );
  }

  switch (subcommand) {
    case "start":
      return temporalStart();
    case "stop":
      return temporalStop();
    case "restart":
      return temporalRestart();
    case "status":
      return temporalStatus();
    case "logs":
      return temporalLogs();
  }
}
