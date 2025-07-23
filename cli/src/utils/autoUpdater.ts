import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { spawn } from "child_process";
import updateNotifier from "update-notifier";

import pkg from "../../package.json" with { type: "json" };
import { executeCommand } from "./command.js";

/**
 * Perform the auto-update by installing the latest version globally
 */
export async function performAutoUpdate(): Promise<Result<string, Error>> {
  try {
    // First try to detect which package manager was used to install
    const whichNpm = await executeCommand("which", ["npm"]);
    if (whichNpm.isErr()) {
      return new Err(new Error("npm not found in PATH"));
    }

    // Use npm install to update to latest version with increased timeout
    const result = await executeCommand(
      "npm",
      ["install", "-g", `${pkg.name}@latest`],
      undefined,
      60000 // 60 second timeout for npm install
    );

    if (result.isErr()) {
      if (process.platform !== "win32" && result.error.stderr?.includes("EACCES")) {
        return new Err(
          new Error(
            `Permission denied. Please fix your npm permissions or run manually:\n` +
            `  npm install -g ${pkg.name}@latest\n` +
            `\nFor npm permission fixes see: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally`
          )
        );
      }
      return new Err(new Error(`Update failed: ${result.error.message}`));
    }

    if (result.value.exitCode !== 0) {
      return new Err(
        new Error(
          `Update failed with exit code ${result.value.exitCode}: ${result.value.stderr}`
        )
      );
    }

    return new Ok(result.value.stdout);
  } catch (error) {
    return new Err(
      new Error(
        `Update failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

/**
 * Check for updates and auto-update if available
 * Returns true if an update was performed, false otherwise
 */
export async function autoUpdateIfAvailable(): Promise<Result<boolean, Error>> {
  // Skip update check in CI environments
  if (process.env.CI || process.env.NODE_ENV === "test") {
    return new Ok(false);
  }

  const notifier = updateNotifier({pkg})

  const updateInfo = {
    hasUpdate: notifier.update !== null,
    currentVersion: pkg.version,
    latestVersion: notifier.update?.latest || pkg.version,
  }

  if (!updateInfo.hasUpdate) {
    return new Ok(false);
  }

  console.log(
    `↻ Update available: ${updateInfo.currentVersion} → ${updateInfo.latestVersion}`
  );
  console.log("▶ Updating Dust CLI...");

  const updateResult = await performAutoUpdate();

  if (updateResult.isErr()) {
    const errorMsg = (`✗ Auto-update failed: ${updateResult.error.message}\n▶ You can update manually by running: npm install -g ${pkg.name}@latest`);
    return new Err(new Error(errorMsg));
  }

  console.log(`✓ Successfully updated to version ${updateInfo.latestVersion}`);

  return new Ok(true);
}

/**
 * Restart the process with the same arguments after an update
 */
export function restartProcess(): never {
  const args = process.argv.slice(1); // Remove node executable path
  
  console.log("▶ Restarting with updated version...");
  
  // Spawn new process with same arguments
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: 'inherit'
  });
  
  child.unref();
  process.exit(0);
}