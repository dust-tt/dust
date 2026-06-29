import { ControlPlaneClient, type RemoteBee } from "../lib/control-plane-client";
import { getEnvironment, listEnvironments } from "../lib/environment";
import { logger } from "../lib/logger";
import { Ok, type Result } from "../lib/result";
import { formatState, getStateInfo } from "../lib/state";

interface ListOptions {
  remote?: boolean;
}

function renderRemoteBee(bee: RemoteBee): void {
  // env/agent state are in-bee and surfaced once command-exec lands (M2); for
  // now the control plane is authoritative only for host state.
  const preview = bee.previewUrl ?? "—";
  console.log(`${bee.name.padEnd(20)} ${bee.hostState.padEnd(14)} ${preview}`);
}

async function listRemote(): Promise<Result<void>> {
  const clientResult = await ControlPlaneClient.create();
  if (!clientResult.ok) {
    return clientResult;
  }
  const beesResult = await clientResult.value.listBees();
  if (!beesResult.ok) {
    return beesResult;
  }
  const bees = beesResult.value;
  if (bees.length === 0) {
    logger.info("No remote bees. Create one with: dust-hive spawn --remote <name>");
    return Ok(undefined);
  }

  console.log();
  console.log(`${"NAME".padEnd(20)} ${"HOST STATE".padEnd(14)} PREVIEW URL`);
  console.log("-".repeat(76));
  for (const bee of bees) {
    renderRemoteBee(bee);
  }
  console.log();
  return Ok(undefined);
}

export async function listCommand(options: ListOptions = {}): Promise<Result<void>> {
  if (options.remote) {
    return listRemote();
  }

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
