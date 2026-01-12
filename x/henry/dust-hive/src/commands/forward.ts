import { getEnvironment, listEnvironments } from "../lib/environment";
import {
  getForwarderStatus,
  readForwarderState,
  startForwarder,
  stopForwarder,
} from "../lib/forward";
import { FORWARDER_MAPPINGS, FORWARDER_PORTS } from "../lib/forwarderConfig";
import { logger } from "../lib/logger";
import { FORWARDER_LOG_PATH } from "../lib/paths";
import { isServiceRunning } from "../lib/process";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { getStateInfo } from "../lib/state";

function printUsage(): void {
  console.log("Usage: dust-hive forward [NAME|status|stop]");
  console.log();
  console.log("Forward standard local dev ports to an environment's ports.");
  console.log("This enables OAuth redirects to work with dust-hive environments.");
  console.log();
  console.log(`Ports forwarded: ${FORWARDER_PORTS.join(", ")}`);
  console.log(
    `  ${FORWARDER_MAPPINGS.map((mapping) => `${mapping.listenPort} → ${mapping.name}`).join(", ")}`
  );
  console.log();
  console.log("Commands:");
  console.log("  dust-hive forward          Forward to the last warmed environment");
  console.log("  dust-hive forward NAME     Forward to a specific environment");
  console.log("  dust-hive forward status   Show current forwarding status");
  console.log("  dust-hive forward stop     Stop the forwarder");
  console.log();
}

async function findLastWarmedEnv(): Promise<string | null> {
  const state = await readForwarderState();
  if (state) {
    // Check if the last env still exists and is warm
    const env = await getEnvironment(state.targetEnv);
    if (env) {
      const stateInfo = await getStateInfo(env);
      if (stateInfo.state === "warm") {
        return state.targetEnv;
      }
    }
  }

  // Fall back to finding any warm environment
  const envNames = await listEnvironments();
  for (const name of envNames) {
    const env = await getEnvironment(name);
    if (env) {
      const stateInfo = await getStateInfo(env);
      if (stateInfo.state === "warm") {
        return name;
      }
    }
  }

  return null;
}

async function showStatus(): Promise<Result<void>> {
  const status = await getForwarderStatus();

  console.log();
  console.log("Forwarder Status");
  console.log("================");

  if (status.running && status.state) {
    console.log("Status:     \x1b[32mRunning\x1b[0m");
    console.log(`PID:        ${status.pid}`);
    console.log(`Target:     ${status.state.targetEnv} (base port ${status.state.basePort})`);
    console.log(`Updated:    ${status.state.updatedAt}`);
    console.log(`Listening:  ports ${FORWARDER_PORTS.join(", ")}`);

    // Check if target is still warm
    const env = await getEnvironment(status.state.targetEnv);
    if (env) {
      const stateInfo = await getStateInfo(env);
      if (stateInfo.state !== "warm") {
        console.log();
        console.log(
          `\x1b[33mWarning: Target environment '${status.state.targetEnv}' is ${stateInfo.state}\x1b[0m`
        );
        console.log("Connections to http://localhost:3000 will fail.");
      }
    } else {
      console.log();
      console.log(
        `\x1b[33mWarning: Target environment '${status.state.targetEnv}' no longer exists\x1b[0m`
      );
    }
  } else if (status.state) {
    console.log("Status:     \x1b[90mStopped\x1b[0m");
    console.log(`Last target: ${status.state.targetEnv} (base port ${status.state.basePort})`);
    console.log(`Last update: ${status.state.updatedAt}`);
  } else {
    console.log("Status:     \x1b[90mNot configured\x1b[0m");
    console.log();
    console.log("Run 'dust-hive forward NAME' to start forwarding to an environment.");
  }

  console.log();
  console.log(`Log file:   ${FORWARDER_LOG_PATH}`);
  console.log();

  return Ok(undefined);
}

async function handleStop(): Promise<Result<void>> {
  const wasRunning = await stopForwarder();

  if (wasRunning) {
    logger.success("Forwarder stopped");
  } else {
    logger.info("Forwarder was not running");
  }

  return Ok(undefined);
}

async function forwardToEnv(name: string): Promise<Result<void>> {
  const env = await getEnvironment(name);
  if (!env) {
    return Err(new CommandError(`Environment '${name}' not found`));
  }

  // Check if front is running (at minimum)
  const frontRunning = await isServiceRunning(name, "front");
  if (!frontRunning) {
    return Err(
      new CommandError(
        `Environment '${name}' does not have front running. Run 'dust-hive warm ${name}' first.`
      )
    );
  }

  await startForwarder(env.ports.base, name);

  return Ok(undefined);
}

export async function forwardCommand(subcommand?: string): Promise<Result<void>> {
  // No args: forward to last warmed env
  if (!subcommand) {
    const lastEnv = await findLastWarmedEnv();
    if (!lastEnv) {
      printUsage();
      return Err(new CommandError("No warm environment found. Run 'dust-hive warm NAME' first."));
    }
    return forwardToEnv(lastEnv);
  }

  // status: show current status
  if (subcommand === "status") {
    return showStatus();
  }

  // stop: stop the forwarder
  if (subcommand === "stop") {
    return handleStop();
  }

  // help: show usage
  if (subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    printUsage();
    return Ok(undefined);
  }

  // NAME: forward to specific env
  return forwardToEnv(subcommand);
}
