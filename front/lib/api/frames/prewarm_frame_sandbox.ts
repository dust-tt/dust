import { isSandboxNotRunningError } from "@app/lib/api/sandbox/errors";
import { ensureFrameSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { getAuthenticatedWorkspaceUser } from "@app/lib/api/sandbox_functions/workspace_user";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

async function prewarmFrameSandboxRun(
  auth: Authenticator,
  frame: FileResource
): Promise<void> {
  const [hasFunctions, canUse, user] = await Promise.all([
    frame.hasActiveFrameFunctions(),
    frame.canCurrentUserUseFrame(auth),
    getAuthenticatedWorkspaceUser(auth),
  ]);
  if (!hasFunctions || !canUse || !user) {
    return;
  }

  const result = await ensureFrameSandboxReady(auth, frame, {
    wakeOnly: true,
  });
  // A Frame without a wakeable sandbox is left to its first call, which creates one.
  if (result.isErr() && !isSandboxNotRunningError(result.error)) {
    logger.warn(
      {
        frameId: frame.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
        err: result.error,
      },
      "Frame sandbox pre-warm failed"
    );
  }
}

/**
 * @cc [owner:davidebbo,label:security;performance] prewarm-gated-like-a-call
 * The Frame's sandbox MUST only be woken when its active publication declares a function and the
 * caller could call one: a workspace member for whom `canCurrentUserUseFrame` holds. Otherwise the
 * pre-warm MUST do nothing.
 */
/**
 * @cc [owner:davidebbo,label:concurrency] prewarm-never-creates
 * The pre-warm MUST only reuse a running sandbox or wake a sleeping one. It MUST NOT create or
 * recreate one: creation stays with the Frame's first call, so no pre-warm can leave a sandbox
 * marked running while its mounts and state are still being set up.
 */
/**
 * @cc [owner:davidebbo,label:error-handling] prewarm-never-rejects
 * The returned promise MUST NOT reject, so callers can leave it detached. Pre-warm failures MUST
 * be logged, never surfaced to the caller.
 */
/**
 * Start waking a Frame's sandbox, so the calls its UI makes once loaded find it running. Callers
 * do not wait on it: the next call runs the full readiness path itself.
 */
export function prewarmFrameSandbox(
  auth: Authenticator,
  frame: FileResource
): Promise<void> {
  return prewarmFrameSandboxRun(auth, frame).catch((err) => {
    logger.error(
      {
        frameId: frame.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
        err: normalizeError(err),
      },
      "Frame sandbox pre-warm threw"
    );
  });
}
