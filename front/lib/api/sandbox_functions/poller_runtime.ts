import config from "@app/lib/api/config";
import { generateSandboxPollerToken } from "@app/lib/api/sandbox/access_tokens";
import { rootCommand } from "@app/lib/api/sandbox/root_command";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { randomBytes } from "crypto";

const POLLER_CONFIG_DIR = "/etc/dust";
const POLLER_CONFIG_PATH = `${POLLER_CONFIG_DIR}/poller.json`;
const POLLER_TOKEN_PATH = `${POLLER_CONFIG_DIR}/poller-token`;
const POLLER_STATE_PATH = "/var/lib/dust-poller/token";
const POLLER_UNIT = "dust-poller.service";

function pollerApiBaseUrl(): string {
  return isDevelopment() && config.getSandboxDevFrontHostName()
    ? `https://${config.getSandboxDevFrontHostName()}`
    : config.getApiBaseUrl();
}

/**
 * Install the poller's settings and credential, and start it.
 *
 * Run on every wake so the pod is reachable from its first invocation rather than from the second.
 * Restarting is what makes the freshly installed credential take effect: a poller already running
 * holds one front revoked when it last connected, and only a restart makes it read the new file.
 *
 * Never fails a wake. A pod without a poller is a pod whose invocations take the sandbox exec
 * path, which is exactly what they do today.
 */
export async function startSandboxFunctionPoller(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<void> {
  if (!(await hasFeatureFlag(auth, "sandbox_function_warm_channel"))) {
    return;
  }

  const result = await installAndStartPoller(auth, sandbox);
  if (result.isErr()) {
    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        sandboxId: sandbox.sId,
        error: result.error.message,
      },
      "Failed to start the Pod function poller"
    );
  }
}

async function installAndStartPoller(
  auth: Authenticator,
  sandbox: SandboxResource
): Promise<Result<undefined, Error>> {
  const token = await generateSandboxPollerToken(auth, { sandbox });
  const pollerConfig = JSON.stringify({
    apiUrl: pollerApiBaseUrl(),
    workspaceId: auth.getNonNullableWorkspace().sId,
  });

  // Both files land through a temp file and a move so the poller, which may be mid-restart, never
  // reads a partial one. The token goes in over stdin so it never reaches argv or the journal.
  const tokenTmpPath = `${POLLER_CONFIG_DIR}/.poller-token.${randomBytes(8).toString("hex")}.tmp`;
  const writeToken = rootCommand.and([
    rootCommand.exec("/usr/bin/install", [
      "-d",
      "-o",
      "root",
      "-g",
      "root",
      "-m",
      "755",
      POLLER_CONFIG_DIR,
    ]),
    rootCommand.exec("/usr/bin/install", [
      "-o",
      "root",
      "-g",
      "root",
      "-m",
      "600",
      "/dev/stdin",
      tokenTmpPath,
    ]),
    rootCommand.exec("/usr/bin/mv", [tokenTmpPath, POLLER_TOKEN_PATH]),
  ]);

  const tokenResult = await sandbox.execRoot(auth, writeToken, {
    stdin: token,
  });
  if (tokenResult.isErr()) {
    return tokenResult;
  }
  if (tokenResult.value.exitCode !== 0) {
    return new Err(
      new Error(
        `Failed to install the Pod function poller token: ${
          tokenResult.value.stderr ||
          tokenResult.value.stdout ||
          "unknown error"
        }`
      )
    );
  }

  const configTmpPath = `${POLLER_CONFIG_DIR}/.poller.${randomBytes(8).toString("hex")}.tmp`;
  const startPoller = rootCommand.and([
    rootCommand.exec("/usr/bin/install", [
      "-o",
      "root",
      "-g",
      "root",
      "-m",
      "600",
      "/dev/stdin",
      configTmpPath,
    ]),
    rootCommand.exec("/usr/bin/mv", [configTmpPath, POLLER_CONFIG_PATH]),
    // The credential the poller last rotated to is gone the moment we install a new one, and it
    // would otherwise take precedence over what we just wrote.
    rootCommand.exec("/bin/rm", ["-f", POLLER_STATE_PATH]),
    rootCommand.exec("/usr/bin/systemctl", ["daemon-reload"]),
    rootCommand.exec("/usr/bin/systemctl", ["restart", POLLER_UNIT]),
  ]);

  const startResult = await sandbox.execRoot(auth, startPoller, {
    stdin: pollerConfig,
  });
  if (startResult.isErr()) {
    return startResult;
  }
  if (startResult.value.exitCode !== 0) {
    return new Err(
      new Error(
        `Failed to start the Pod function poller: ${
          startResult.value.stderr ||
          startResult.value.stdout ||
          "unknown error"
        }`
      )
    );
  }

  logger.info(
    {
      workspaceId: auth.getNonNullableWorkspace().sId,
      sandboxId: sandbox.sId,
    },
    "Started the Pod function poller"
  );

  return new Ok(undefined);
}
