import { readdir } from "node:fs/promises";
import path from "node:path";
import * as p from "@clack/prompts";
import { requireEnvironment } from "../lib/commands";
import { directoryExists, fileExists } from "../lib/fs";
import { logger } from "../lib/logger";
import { getWorktreeDir } from "../lib/paths";
import { restoreTerminal } from "../lib/prompt";
import { CommandError, Err, Ok, type Result } from "../lib/result";
import { getStateInfo } from "../lib/state";

// Folders to ignore when scanning for scenarios
// These are utility folders that don't contain seed scripts
const IGNORED_FOLDERS = new Set(["factories"]);

// Get list of available scenarios by scanning the seed directory
async function getAvailableScenarios(frontPath: string): Promise<string[]> {
  const seedPath = path.join(frontPath, "scripts", "seed");

  const dirExists = await directoryExists(seedPath);
  if (!dirExists) {
    return [];
  }

  // Read directory entries
  const entries = await readdir(seedPath, { withFileTypes: true });

  const scenarios: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && !IGNORED_FOLDERS.has(entry.name)) {
      // Check if seed.ts exists in this directory
      const seedFile = path.join(seedPath, entry.name, "seed.ts");
      const exists = await fileExists(seedFile);
      if (exists) {
        scenarios.push(entry.name);
      }
    }
  }

  return scenarios.sort();
}

async function selectScenarios(scenarios: string[]): Promise<string[]> {
  if (scenarios.length === 0) {
    return [];
  }

  const result = await p.multiselect({
    message: "Select scenarios to run (space to toggle, enter to confirm)",
    initialValues: [],
    required: true,
    options: scenarios.map((name) => ({ value: name, label: name })),
  });

  if (p.isCancel(result)) {
    return [];
  }

  return result as string[];
}

export async function feedCommand(
  nameArg: string | undefined,
  scenarioNameArg: string | undefined
): Promise<Result<void>> {
  // Skip restoreTerminal if we need interactive scenario selection after
  const skipRestore = !scenarioNameArg;
  const envResult = await requireEnvironment(nameArg, "feed", {
    skipRestoreTerminal: skipRestore,
  });
  if (!envResult.ok) return envResult;

  const env = envResult.value;

  // Check if environment is warm
  const stateInfo = await getStateInfo(env);
  if (stateInfo.state !== "warm") {
    return Err(
      new CommandError(
        `Environment '${env.name}' is not warm (current state: ${stateInfo.state}). Run 'dust-hive warm ${env.name}' first.`
      )
    );
  }

  // Get front directory path
  const worktreePath = getWorktreeDir(env.name);
  const frontPath = path.join(worktreePath, "front");

  // Get list of available scenarios
  const availableScenarios = await getAvailableScenarios(frontPath);

  if (availableScenarios.length === 0) {
    return Err(new CommandError("No scenarios found in front/scripts/seed/"));
  }

  // Handle scenario selection
  let scenarioNames: string[];
  if (scenarioNameArg) {
    // Single scenario provided via CLI argument
    scenarioNames = [scenarioNameArg];
  } else {
    // Interactive multi-select
    const selected = await selectScenarios(availableScenarios);
    if (selected.length === 0) {
      return Err(new CommandError("No scenarios selected"));
    }
    scenarioNames = selected;
  }

  // Restore terminal after all interactive prompts are done
  // This is important before spawning the seed script subprocess
  restoreTerminal();

  // Validate all scenarios exist before running any
  for (const scenarioName of scenarioNames) {
    const scenarioScriptPath = path.join(frontPath, "scripts", "seed", scenarioName, "seed.ts");
    const scenarioExists = await fileExists(scenarioScriptPath);

    if (!scenarioExists) {
      const scenarioList = availableScenarios.map((s) => `  - ${s}`).join("\n");
      return Err(
        new CommandError(
          `Scenario '${scenarioName}' not found.\n\nAvailable scenarios:\n${scenarioList}`
        )
      );
    }
  }

  // Run each scenario sequentially
  for (const scenarioName of scenarioNames) {
    logger.info(`Running seed script for scenario '${scenarioName}'...`);
    console.log();

    const proc = Bun.spawn(["npx", "tsx", `scripts/seed/${scenarioName}/seed.ts`, "--execute"], {
      cwd: frontPath,
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return Err(
        new CommandError(
          `Seed script for scenario '${scenarioName}' failed with exit code ${exitCode}`
        )
      );
    }

    console.log();
    logger.success(`Scenario '${scenarioName}' seeded successfully`);
  }

  if (scenarioNames.length > 1) {
    console.log();
    logger.success(`All ${scenarioNames.length} scenarios seeded successfully`);
  }

  return Ok(undefined);
}
