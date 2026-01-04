// Shell command builder for consistent command construction

export interface ShellConfig {
  sourceNvm?: boolean;
  sourceEnv?: string; // path to env.sh
  run: string | string[]; // command(s) to run
}

// Build a shell command string from config
export function buildShell(config: ShellConfig): string {
  const parts: string[] = [];

  if (config.sourceEnv) {
    parts.push(`source ${config.sourceEnv}`);
  }

  if (config.sourceNvm) {
    parts.push("source ~/.nvm/nvm.sh && nvm use");
  }

  const commands = Array.isArray(config.run) ? config.run : [config.run];
  parts.push(...commands);

  return parts.join("\n");
}
