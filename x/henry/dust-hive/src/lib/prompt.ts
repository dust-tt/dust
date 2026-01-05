// Interactive prompts for environment selection
// Uses simple line input (no raw mode) for compatibility with terminal multiplexers

import { getLastActiveEnv } from "./activity";
import { listEnvironments } from "./environment";
import { detectEnvFromCwd } from "./paths";

export interface SelectEnvironmentOptions {
  message?: string;
}

// Simple line reader using Bun's console async iterator (same as spawn.ts)
async function readLine(prompt: string): Promise<string | null> {
  process.stdout.write(prompt);
  for await (const line of console) {
    return line.trim();
  }
  return null;
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

function findDefault(
  sortedEnvs: string[],
  envs: string[],
  currentEnv: string | null,
  lastActiveEnv: string | null
): number {
  if (currentEnv && envs.includes(currentEnv)) {
    return sortedEnvs.indexOf(currentEnv);
  }
  if (lastActiveEnv && envs.includes(lastActiveEnv)) {
    return sortedEnvs.indexOf(lastActiveEnv);
  }
  return 0;
}

function printList(
  sortedEnvs: string[],
  defaultIndex: number,
  currentEnv: string | null,
  lastActiveEnv: string | null,
  message: string
): void {
  console.log();
  console.log(message);
  for (let i = 0; i < sortedEnvs.length; i++) {
    const name = sortedEnvs[i];
    let suffix = "";
    if (name === currentEnv) {
      suffix = " (current)";
    } else if (name === lastActiveEnv) {
      suffix = " (last)";
    }
    const marker = i === defaultIndex ? ">" : " ";
    console.log(`  ${marker} ${i + 1}. ${name}${suffix}`);
  }
}

function parseInput(input: string, count: number, defaultIndex: number): number | null {
  if (input === "") {
    return defaultIndex;
  }
  const num = Number.parseInt(input, 10);
  if (Number.isNaN(num) || num < 1 || num > count) {
    console.log("Invalid selection");
    return null;
  }
  return num - 1;
}

// Interactively select an environment using simple numbered list
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
  const defaultIndex = findDefault(sortedEnvs, envs, currentEnv, lastActiveEnv);

  printList(
    sortedEnvs,
    defaultIndex,
    currentEnv,
    lastActiveEnv,
    options?.message ?? "Select environment:"
  );

  const input = await readLine(`[${defaultIndex + 1}]: `);
  if (input === null) {
    return null;
  }

  const selected = parseInput(input, sortedEnvs.length, defaultIndex);
  if (selected === null) {
    return null;
  }

  return sortedEnvs[selected] ?? null;
}
