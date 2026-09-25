import { isSandboxNotRunningError } from "@app/lib/api/sandbox/errors";
import { ensureFrameSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

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
export async function prewarmFrameSandbox(
  auth: Authenticator,
  frame: FileResource
): Promise<void> {
  // Read from the Frame rather than `auth`, so building it cannot throw outside the `try`.
  const logContext = {
    frameId: frame.sId,
    workspaceModelId: frame.workspaceId,
  };
  try {
    // `canCurrentUserUseFrame` also requires a workspace member.
    const [hasFunctions, canUse] = await Promise.all([
      frame.hasActiveFrameFunctions(),
      frame.canCurrentUserUseFrame(auth),
    ]);
    if (!hasFunctions || !canUse) {
      return;
    }

    const result = await ensureFrameSandboxReady(auth, frame, {
      wakeOnly: true,
    });
    // A Frame without a wakeable sandbox is left to its first call, which creates one.
    if (result.isErr() && !isSandboxNotRunningError(result.error)) {
      logger.warn(
        { ...logContext, err: result.error },
        "Frame sandbox pre-warm failed"
      );
    }
  } catch (err) {
    logger.error(
      { ...logContext, err: normalizeError(err) },
      "Frame sandbox pre-warm threw"
    );
  }
}
