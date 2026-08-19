import path from "node:path";
import * as p from "@clack/prompts";
import { requireEnvironment } from "../lib/commands";
import { getEnvironmentWorktreeDir } from "../lib/environment";
import { logger } from "../lib/logger";
import { restoreTerminal } from "../lib/prompt";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { WORKSPACE_ID } from "../lib/seed";
import { getStateInfo } from "../lib/state";

interface FlagInfo {
  name: string;
  description: string;
}

// Get the list of available feature flags by dynamically importing the config
// directly from the worktree's front/ source. The file is self-contained (no
// @app/ imports) so Bun can import it without path alias resolution.
async function getAvailableFlags(frontPath: string): Promise<FlagInfo[]> {
  const flagsPath = path.join(frontPath, "types", "shared", "feature_flags.ts");

  const flagsFile = Bun.file(flagsPath);
  if (!(await flagsFile.exists())) {
    return [];
  }

  const mod = await import(flagsPath);
  const config: Record<string, { description: string }> = mod.WHITELISTABLE_FEATURES_CONFIG;

  return Object.entries(config)
    .map(([name, { description }]) => ({ name, description }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function selectFlags(availableFlags: FlagInfo[], disable: boolean): Promise<string[]> {
  const result = await p.multiselect({
    message: `Select feature flags to ${disable ? "disable" : "enable"} (space to toggle, enter to confirm)`,
    initialValues: [],
    required: true,
    options: availableFlags.map((f) => ({
      value: f.name,
      label: f.name,
      hint: f.description,
    })),
  });

  if (p.isCancel(result)) {
    return [];
  }

  return result as string[];
}

async function toggleFlag(
  frontPath: string,
  flagName: string,
  disable: boolean
): Promise<Result<void>> {
  logger.info(
    `${disable ? "Disabling" : "Enabling"} feature flag '${flagName}' on workspace ${WORKSPACE_ID}...`
  );
  console.log();

  const args = [
    "npx",
    "tsx",
    "scripts/toggle_feature_flags.ts",
    "--featureFlag",
    flagName,
    "--workspaceIds",
    WORKSPACE_ID,
    "--execute",
  ];

  if (!disable) {
    args.push("--enable");
  }

  const proc = Bun.spawn(args, {
    cwd: frontPath,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    return Err(
      new CommandError(
        `toggle_feature_flags.ts failed for '${flagName}' with exit code ${exitCode}`
      )
    );
  }

  console.log();
  logger.success(`Feature flag '${flagName}' ${disable ? "disabled" : "enabled"} successfully`);

  return Ok(undefined);
}

export async function flagCommand(
  nameArg: string | undefined,
  flagNameArgs: string[] | undefined,
  options?: { disable?: boolean }
): Promise<Result<void>> {
  const requestedFlags = flagNameArgs ?? [];
  const skipRestore = requestedFlags.length === 0;
  const envResult = await requireEnvironment(nameArg, "flag", {
    skipRestoreTerminal: skipRestore,
  });
  if (!envResult.ok) return envResult;

  const env = envResult.value;

  // Check if environment is warm
  const stateInfo = await getStateInfo(env);
  if (stateInfo.state !== "warm") {
    restoreTerminal();
    return Err(
      new CommandError(
        `Environment '${env.name}' is not warm (current state: ${stateInfo.state}). Run 'dust-hive warm ${env.name}' first.`
      )
    );
  }

  const worktreePath = getEnvironmentWorktreeDir(env.metadata);
  const frontPath = path.join(worktreePath, "front");

  const availableFlags = await getAvailableFlags(frontPath);
  if (availableFlags.length === 0) {
    restoreTerminal();
    return Err(
      new CommandError("Could not read feature flags from front/types/shared/feature_flags.ts")
    );
  }

  const disable = Boolean(options?.disable);

  // Resolve flag names — interactive multi-select if none provided
  let flagNames: string[];
  if (requestedFlags.length > 0) {
    flagNames = requestedFlags;
  } else {
    const selected = await selectFlags(availableFlags, disable);
    restoreTerminal();

    if (selected.length === 0) {
      return Err(new CommandError("No flag selected"));
    }

    flagNames = selected;
  }

  // Validate every flag before toggling any, so a typo cannot leave a partial toggle behind.
  const availableNames = new Set(availableFlags.map((f) => f.name));
  const unknownFlags = flagNames.filter((flagName) => !availableNames.has(flagName));
  if (unknownFlags.length > 0) {
    return Err(
      new CommandError(
        `Unknown feature flag(s): ${unknownFlags.join(", ")}. Run 'dust-hive flag ${env.name}' with no flag name to pick from the list.`
      )
    );
  }

  for (const flagName of flagNames) {
    const toggleResult = await toggleFlag(frontPath, flagName, disable);
    if (!toggleResult.ok) return toggleResult;
  }

  if (flagNames.length > 1) {
    console.log();
    logger.success(
      `All ${flagNames.length} feature flags ${disable ? "disabled" : "enabled"} successfully`
    );
  }

  return Ok(undefined);
}
