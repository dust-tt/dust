import { ensureFrameSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { getFramePublicationFunctionsMountPoint } from "@app/types/mount_path";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const DSBX_BIN_PATH = "/opt/bin/dsbx";
const SEED_TIMEOUT_MS = 60 * 1000;

/**
 * Best-effort: wake the frame sandbox (if needed), materialize this
 * publication's functions locally, and start the publication worker with
 * every slug already imported so the first fast invoke is a socket round
 * trip. Never throws — callers fire and forget after a successful publish.
 */
export async function seedFramePublicationFunctionsArchive(
  auth: Authenticator,
  {
    frame,
    publicationId,
  }: {
    frame: FileResource;
    publicationId: string;
  }
): Promise<void> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const logCtx = {
    workspaceId,
    frameId: frame.sId,
    publicationId,
  };

  const ensureResult = await ensureFrameSandboxReady(auth, frame);
  if (ensureResult.isErr()) {
    logger.info(
      { ...logCtx, error: ensureResult.error.message },
      "Skipping functions.tar seed: frame sandbox unavailable"
    );
    return;
  }

  const { sandbox } = ensureResult.value;
  const functionsDirectory = getFramePublicationFunctionsMountPoint({
    frameId: frame.sId,
    publicationId,
  });
  const command = `${DSBX_BIN_PATH} function materialize-archive`;

  try {
    const execResult = await sandbox.exec(auth, command, {
      timeoutMs: SEED_TIMEOUT_MS,
      user: "agent-proxied",
      envVars: {
        DUST_FUNCTIONS_DIR: functionsDirectory,
      },
    });
    if (execResult.isErr()) {
      logger.warn(
        { ...logCtx, error: execResult.error.message },
        "functions.tar seed exec failed"
      );
      return;
    }
    if (execResult.value.exitCode !== 0) {
      logger.warn(
        {
          ...logCtx,
          exitCode: execResult.value.exitCode,
          stderr: execResult.value.stderr,
          stdout: execResult.value.stdout,
        },
        "functions.tar seed exited non-zero"
      );
      return;
    }
    logger.info(
      logCtx,
      "Seeded publication worker (local bundles + eager import)"
    );
  } catch (err) {
    logger.warn(
      { ...logCtx, error: normalizeError(err).message },
      "functions.tar seed threw"
    );
  }
}
