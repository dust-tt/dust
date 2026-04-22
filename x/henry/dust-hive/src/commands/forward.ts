import { getEnvironment } from "../lib/environment";
import { getForwarderStatus, startForwarder, stopForwarder } from "../lib/forward";
import { FORWARDER_MAPPINGS } from "../lib/forwarderConfig";
import { logger } from "../lib/logger";
import { FORWARDER_LOG_PATH, detectEnvFromCwd } from "../lib/paths";
import { isServiceRunning } from "../lib/process";
import { restoreTerminal, selectEnvironment } from "../lib/prompt";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { getStateInfo } from "../lib/state";

export async function forwardStatusCommand(): Promise<Result<void>> {
  const status = await getForwarderStatus();

  console.log();
  console.log("Forwarder Status");
  console.log("================");

  if (status.running && status.state) {
    console.log("Status:     \x1b[32mRunning\x1b[0m");
    console.log(`PID:        ${status.pid}`);
    console.log(`Target:     ${status.state.targetEnv} (base port ${status.state.basePort})`);
    console.log(`Updated:    ${status.state.updatedAt}`);
    console.log("Listening:");
    for (const m of FORWARDER_MAPPINGS) {
      console.log(
        `            ${m.name.padEnd(16)} ${String(m.listenPort).padStart(4)} → ${status.state.basePort + m.targetOffset}`
      );
    }

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

export async function forwardStopCommand(): Promise<Result<void>> {
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

export async function forwardCommand(name?: string): Promise<Result<void>> {
  // Route subcommands (for cac multi-word command compatibility)
  if (name === "status") {
    return forwardStatusCommand();
  }
  if (name === "stop") {
    return forwardStopCommand();
  }

  // NAME provided: forward to specific env
  if (name) {
    return forwardToEnv(name);
  }

  // No name: default to current env (detected from cwd)
  const currentEnv = detectEnvFromCwd();
  if (currentEnv) {
    return forwardToEnv(currentEnv);
  }

  // No current env: ask interactively
  const selected = await selectEnvironment({ message: "Select environment for forward" });
  restoreTerminal();

  if (!selected) {
    return Err(new CommandError("No environment selected"));
  }

  return forwardToEnv(selected);
}
