import path from "node:path";
import * as p from "@clack/prompts";
import { requireEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import { getWorktreeDir } from "../lib/paths";
import { restoreTerminal } from "../lib/prompt";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { WORKSPACE_SID } from "../lib/seed";
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

export async function flagCommand(
  nameArg: string | undefined,
  flagNameArg: string | undefined,
  options?: { disable?: boolean }
): Promise<Result<void>> {
  const skipRestore = !flagNameArg;
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

  const worktreePath = getWorktreeDir(env.name);
  const frontPath = path.join(worktreePath, "front");

  // Resolve flag name — interactive select if not provided
  let flagName = flagNameArg;
  if (!flagName) {
    const availableFlags = await getAvailableFlags(frontPath);

    if (availableFlags.length === 0) {
      restoreTerminal();
      return Err(
        new CommandError("Could not read feature flags from front/types/shared/feature_flags.ts")
      );
    }

    const selected = await p.select({
      message: "Select a feature flag",
      options: availableFlags.map((f) => ({
        value: f.name,
        label: f.name,
        hint: f.description,
      })),
    });

    restoreTerminal();

    if (p.isCancel(selected)) {
      return Err(new CommandError("No flag selected"));
    }

    flagName = selected as string;
  }

  const disable = Boolean(options?.disable);
  const action = disable ? "Disabling" : "Enabling";

  logger.info(`${action} feature flag '${flagName}' on workspace ${WORKSPACE_SID}...`);
  console.log();

  const args = [
    "npx",
    "tsx",
    "scripts/toggle_feature_flags.ts",
    "--featureFlag",
    flagName,
    "--workspaceIds",
    WORKSPACE_SID,
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
    return Err(new CommandError(`toggle_feature_flags.ts failed with exit code ${exitCode}`));
  }

  console.log();
  logger.success(`Feature flag '${flagName}' ${disable ? "disabled" : "enabled"} successfully`);

  return Ok(undefined);
}
