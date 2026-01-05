import { getEnvironment, listEnvironments } from "../lib/environment";
import { logger } from "../lib/logger";
import { Ok, type Result } from "../lib/result";
import { formatState, getStateInfo } from "../lib/state";

export async function listCommand(): Promise<Result<void>> {
  const envNames = await listEnvironments();

  if (envNames.length === 0) {
    logger.info("No environments found. Create one with: dust-hive spawn");
    return Ok(undefined);
  }

  // Print header
  console.log();
  console.log(
    `${"NAME".padEnd(20)} ${"STATE".padEnd(12)} ${"PORTS".padEnd(12)} ${"BRANCH".padEnd(30)}`
  );
  console.log("-".repeat(76));

  for (const name of envNames) {
    const env = await getEnvironment(name);
    if (!env) {
      continue;
    }

    const stateInfo = await getStateInfo(env);
    const stateStr = formatState(stateInfo);
    const portRange = `${env.ports.base}-${env.ports.base + 999}`;

    console.log(
      `${name.padEnd(20)} ${stateStr.padEnd(12)} ${portRange.padEnd(12)} ${env.metadata.workspaceBranch.padEnd(30)}`
    );

    // Print warnings on next line if any
    for (const warning of stateInfo.warnings) {
      console.log(`${"".padEnd(20)} \x1b[33m(${warning})\x1b[0m`);
    }
  }

  console.log();

  return Ok(undefined);
}
