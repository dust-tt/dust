// Interactive prompts for environment selection

import * as p from "@clack/prompts";
import { getLastActiveEnv } from "./activity";
import { listEnvironments } from "./environment";
import { detectEnvFromCwd } from "./paths";

export interface SelectEnvironmentOptions {
  message?: string;
}

// Interactively select an environment
// Returns the selected environment name, or null if cancelled or none available
export async function selectEnvironment(
  options?: SelectEnvironmentOptions
): Promise<string | null> {
  const envs = await listEnvironments();

  if (envs.length === 0) {
    return null;
  }

  // Get context for pre-selection
  const currentEnv = detectEnvFromCwd();
  const lastActiveEnv = await getLastActiveEnv();

  // Sort environments: current first, then last active, then alphabetically
  const sortedEnvs = [...envs].sort((a, b) => {
    if (a === currentEnv) return -1;
    if (b === currentEnv) return 1;
    if (a === lastActiveEnv) return -1;
    if (b === lastActiveEnv) return 1;
    return a.localeCompare(b);
  });

  // Determine initial value for pre-selection
  let initialValue: string | undefined;
  if (currentEnv && envs.includes(currentEnv)) {
    initialValue = currentEnv;
  } else if (lastActiveEnv && envs.includes(lastActiveEnv)) {
    initialValue = lastActiveEnv;
  }

  const result = await p.select({
    message: options?.message ?? "Select environment",
    options: sortedEnvs.map((name) => {
      if (name === currentEnv) {
        return { value: name, label: name, hint: "current directory" };
      }
      if (name === lastActiveEnv) {
        return { value: name, label: name, hint: "last used" };
      }
      return { value: name, label: name };
    }),
    initialValue,
  });

  if (p.isCancel(result)) {
    return null;
  }

  return result ?? null;
}
