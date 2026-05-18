import type { ToolProfile } from "@app/lib/api/sandbox/image/types";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { assertNever } from "@app/types/shared/utils/assert_never";

export const PROFILE_DIR = "/opt/dust/profile";
const COMMAND_HEREDOC_DELIMITER = "DUST_CMD_EOF";

export interface WrapCommandOptions {
  timeoutSec?: number;
}

export function providerToProfile(
  providerId: ModelProviderIdType
): ToolProfile {
  switch (providerId) {
    case "openai":
      return "openai";
    case "google_ai_studio":
      return "gemini";
    case "anthropic":
    case "mistral":
    case "deepseek":
    case "togetherai":
    case "xai":
    case "fireworks":
    case "noop":
      return "anthropic";
    default:
      assertNever(providerId);
  }
}

export function wrapCommand(
  cmd: string,
  providerId: ModelProviderIdType,
  opts?: WrapCommandOptions
): string {
  const profile = providerToProfile(providerId);
  const timeoutSec = opts?.timeoutSec ?? 60;

  if (cmd.split("\n").includes(COMMAND_HEREDOC_DELIMITER)) {
    throw new Error(
      `Command contains the reserved heredoc delimiter '${COMMAND_HEREDOC_DELIMITER}'.`
    );
  }

  return [
    `DUST_PROFILE=${profile} source ${PROFILE_DIR}/common.sh && shell "$(cat <<'${COMMAND_HEREDOC_DELIMITER}'`,
    cmd,
    COMMAND_HEREDOC_DELIMITER,
    `)" ${timeoutSec}`,
  ].join("\n");
}

export function wrapCommandWithCapture(
  cmd: string,
  execId: string,
  providerId: ModelProviderIdType,
  opts?: WrapCommandOptions
): string {
  const baseCommand = wrapCommand(cmd, providerId, opts);
  const outFile = `/tmp/dust_exec_${execId}.out`;
  const exitFile = `/tmp/dust_exec_${execId}.exit`;

  return [
    `exec > >(tee ${outFile}) 2>&1`,
    baseCommand,
    `_EXIT=$?`,
    `echo $_EXIT > ${exitFile}`,
    `exit $_EXIT`,
  ].join("\n");
}

export function buildWaitAndCollectCommand(execId: string): string {
  const pidFile = `/tmp/dust_wac_${execId}.pid`;
  const outFile = `/tmp/dust_exec_${execId}.out`;
  const exitFile = `/tmp/dust_exec_${execId}.exit`;

  return [
    `if [ -f ${pidFile} ]; then`,
    `  kill $(cat ${pidFile}) 2>/dev/null`,
    `fi`,
    `echo $$ > ${pidFile}`,
    `while [ ! -f ${exitFile} ]; do sleep 0.5; done`,
    `cat ${outFile}`,
    `exit $(cat ${exitFile})`,
  ].join("\n");
}
