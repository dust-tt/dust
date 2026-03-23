import type { ModelProviderIdType } from "@app/types/assistant/models/types";

export const PROFILE_DIR = "/opt/dust/profile";

export interface WrapCommandOptions {
  timeoutSec?: number;
}

function getProfileName(_providerId: ModelProviderIdType): string {
  // Future: return provider-specific profiles
  // e.g., if (providerId === "openai") return "openai.sh";
  return "common.sh";
}

export function wrapCommand(
  cmd: string,
  providerId: ModelProviderIdType,
  opts?: WrapCommandOptions
): string {
  const profile = getProfileName(providerId);
  const timeoutSec = opts?.timeoutSec ?? 60;
  // Escape double quotes and backslashes in command for safe embedding
  const escapedCmd = cmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `source ${PROFILE_DIR}/${profile} && shell "${escapedCmd}" ${timeoutSec}`;
}
