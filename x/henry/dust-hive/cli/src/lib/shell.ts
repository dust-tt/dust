// Shell command builder for consistent command construction

export interface ShellConfig {
  sourceNvm?: boolean;
  sourceEnv?: string; // path to env.sh
  run: string | string[]; // command(s) to run
}

/**
 * Safely quote a string for use in shell commands.
 * Uses single quotes and escapes any embedded single quotes.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// Build a shell command string from config
export function buildShell(config: ShellConfig): string {
  const parts: string[] = ["set -e", "set -o pipefail"];

  if (config.sourceEnv) {
    parts.push(`source ${shellQuote(config.sourceEnv)}`);
  }

  if (config.sourceNvm) {
    parts.push('export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"');
    parts.push('[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"');
    parts.push("nvm use");
  }

  const commands = Array.isArray(config.run) ? config.run : [config.run];
  parts.push(...commands);

  return parts.join(" && ");
}
