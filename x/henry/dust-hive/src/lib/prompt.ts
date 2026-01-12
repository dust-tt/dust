// Interactive prompts for environment selection and confirmations
// Uses @clack/prompts for beautiful arrow-key navigation

import * as p from "@clack/prompts";
import { getLastActiveEnv } from "./activity";
import { listEnvironments } from "./environment";
import { detectEnvFromCwd } from "./paths";

export interface SelectEnvironmentOptions {
  message?: string;
  /** If provided, shows a confirmation prompt after selection with this message template.
   * Use {name} as placeholder for the selected environment name.
   * Returns null if user declines confirmation. */
  confirmMessage?: string;
}

/**
 * Restore terminal to cooked mode and clean up stdin.
 * IMPORTANT: Call this before spawning any subprocess that takes over the terminal
 * (like zellij) to prevent terminal corruption.
 *
 * This does three things:
 * 1. Exits raw mode (restores cooked mode)
 * 2. Pauses stdin to stop reading
 * 3. Removes all listeners that clack may have attached
 */
export function restoreTerminal(): void {
  try {
    // Exit raw mode if we're in a TTY
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    // Pause stdin to stop it from reading
    process.stdin.pause();

    // Remove all listeners that clack may have attached
    // This is critical - without this, clack's listeners will interfere
    // with child processes that inherit stdin
    process.stdin.removeAllListeners("data");
    process.stdin.removeAllListeners("keypress");
    process.stdin.removeAllListeners("readable");
  } catch {
    // Ignore errors - best effort cleanup
  }
}

// Prompt user for yes/no confirmation with default
export async function confirm(message: string, defaultYes = true): Promise<boolean> {
  const result = await p.confirm({
    message,
    initialValue: defaultYes,
  });

  if (p.isCancel(result)) {
    return false;
  }

  return result;
}

function sortEnvs(
  envs: string[],
  currentEnv: string | null,
  lastActiveEnv: string | null
): string[] {
  return [...envs].sort((a, b) => {
    if (a === currentEnv) return -1;
    if (b === currentEnv) return 1;
    if (a === lastActiveEnv) return -1;
    if (b === lastActiveEnv) return 1;
    return a.localeCompare(b);
  });
}

function findInitialValue(
  sortedEnvs: string[],
  envs: string[],
  currentEnv: string | null,
  lastActiveEnv: string | null
): string | undefined {
  if (currentEnv && envs.includes(currentEnv)) {
    return currentEnv;
  }
  if (lastActiveEnv && envs.includes(lastActiveEnv)) {
    return lastActiveEnv;
  }
  return sortedEnvs[0];
}

// Interactively select an environment using arrow keys
export async function selectEnvironment(
  options?: SelectEnvironmentOptions
): Promise<string | null> {
  const envs = await listEnvironments();
  if (envs.length === 0) {
    return null;
  }

  const currentEnv = detectEnvFromCwd();
  const lastActiveEnv = await getLastActiveEnv();
  const sortedEnvs = sortEnvs(envs, currentEnv, lastActiveEnv);
  const initialValue = findInitialValue(sortedEnvs, envs, currentEnv, lastActiveEnv);

  const result = await p.select({
    message: options?.message ?? "Select environment",
    initialValue,
    options: sortedEnvs.map((name) => {
      if (name === currentEnv) {
        return { value: name, label: name, hint: "current" };
      }
      if (name === lastActiveEnv) {
        return { value: name, label: name, hint: "last" };
      }
      return { value: name, label: name };
    }),
  });

  if (p.isCancel(result)) {
    return null;
  }

  const selectedName = result as string;

  // If confirmation requested, ask before returning
  if (options?.confirmMessage) {
    const confirmMsg = options.confirmMessage.replace("{name}", selectedName);
    const confirmed = await p.confirm({
      message: confirmMsg,
      initialValue: false,
    });

    if (p.isCancel(confirmed) || !confirmed) {
      return null;
    }
  }

  return selectedName;
}

export interface SelectMultipleEnvironmentsOptions {
  message?: string;
  /** If provided, shows a confirmation prompt after selection with this message template.
   * Use {names} as placeholder for the selected environment names (comma-separated).
   * Use {count} as placeholder for the number of selected environments.
   * Returns empty array if user declines confirmation. */
  confirmMessage?: string;
}

// Interactively select one or more environments using arrow keys and space bar
export async function selectMultipleEnvironments(
  options?: SelectMultipleEnvironmentsOptions
): Promise<string[]> {
  const envs = await listEnvironments();
  if (envs.length === 0) {
    return [];
  }

  const currentEnv = detectEnvFromCwd();
  const lastActiveEnv = await getLastActiveEnv();
  const sortedEnvs = sortEnvs(envs, currentEnv, lastActiveEnv);
  const initialValues: string[] = [];

  const result = await p.multiselect({
    message: options?.message ?? "Select environments (space to select, enter to confirm)",
    initialValues,
    required: true,
    options: sortedEnvs.map((name) => {
      if (name === currentEnv) {
        return { value: name, label: name, hint: "current" };
      }
      if (name === lastActiveEnv) {
        return { value: name, label: name, hint: "last" };
      }
      return { value: name, label: name };
    }),
  });

  if (p.isCancel(result)) {
    return [];
  }

  const selectedNames = result as string[];

  if (selectedNames.length === 0) {
    return [];
  }

  // If confirmation requested, ask before returning
  if (options?.confirmMessage) {
    const namesStr = selectedNames.join(", ");
    const confirmMsg = options.confirmMessage
      .replace("{names}", namesStr)
      .replace("{count}", String(selectedNames.length));
    const confirmed = await p.confirm({
      message: confirmMsg,
      initialValue: false,
    });

    if (p.isCancel(confirmed) || !confirmed) {
      return [];
    }
  }

  return selectedNames;
}
