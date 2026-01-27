import { readdir } from "node:fs/promises";
import path from "node:path";
import * as p from "@clack/prompts";
import { withEnvironment } from "../lib/commands";
import { directoryExists, fileExists } from "../lib/fs";
import { logger } from "../lib/logger";
import { getWorktreeDir } from "../lib/paths";
import { CommandError, Err, Ok } from "../lib/result";
import { getStateInfo } from "../lib/state";

// Get list of available scenarios by scanning the seed directory
async function getAvailableScenarios(frontPath: string): Promise<string[]> {
  const seedPath = path.join(frontPath, "scripts", "seed");

  try {
    const dirExists = await directoryExists(seedPath);
    if (!dirExists) {
      return [];
    }

    // Read directory entries
    const entries = await readdir(seedPath, { withFileTypes: true });

    const scenarios: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Check if seed.ts exists in this directory
        const seedFile = path.join(seedPath, entry.name, "seed.ts");
        const exists = await fileExists(seedFile);
        if (exists) {
          scenarios.push(entry.name);
        }
      }
    }

    return scenarios.sort();
  } catch (_error) {
    return [];
  }
}

// Interactively select a scenario using arrow keys
async function selectScenario(scenarios: string[]): Promise<string | null> {
  if (scenarios.length === 0) {
    return null;
  }

  const result = await p.select({
    message: "Select scenario to run",
    initialValue: scenarios[0],
    options: scenarios.map((name) => ({ value: name, label: name })),
  });

  if (p.isCancel(result)) {
    return null;
  }

  return result as string;
}

export const feedCommand = withEnvironment(
  "feed",
  async (env, scenarioNameArg: string | undefined) => {
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

    // If no scenario name provided, prompt interactively
    let scenarioName = scenarioNameArg;
    if (!scenarioName) {
      const selected = await selectScenario(availableScenarios);
      if (!selected) {
        return Err(new CommandError("No scenario selected"));
      }
      scenarioName = selected;
    }

    // Check if scenario exists
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

    // Run the seed script
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
      return Err(new CommandError(`Seed script failed with exit code ${exitCode}`));
    }

    console.log();
    logger.success(`Scenario '${scenarioName}' seeded successfully`);

    return Ok(undefined);
  }
);
