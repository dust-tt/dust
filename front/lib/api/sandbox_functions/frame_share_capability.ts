import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { podFunctionScopeFromFramePath } from "@app/types/api/pod_function_reference";

/** Header a frame host attaches to invocation requests to present the frame's share token. */
export const FRAME_SHARE_TOKEN_HEADER = "x-dust-frame-share-token";

/**
 * Possession of a Pod app frame's share token is the capability to invoke that app's published
 * functions: the frame is authored by the pod's members and is unusable without them, so being
 * handed its link is being handed the app. The capability grants function resolution only — it
 * never widens reads or writes on the pod, and per-function userIdentity policies still apply.
 */
export type FrameShareCapability = {
  /** sId of the pod the shared frame lives in. */
  podId: string;
  /** Normalized prefix of the frame's app folder — the namespace of the slugs it authorizes. */
  appPrefix: string;
};

/**
 * Validate a frame share token presented alongside a function invocation and derive the
 * capability it carries. Returns null on any mismatch — an invalid token behaves exactly like an
 * absent one, so callers fall through to the regular not-found path.
 */
export async function resolveFrameShareCapability(
  auth: Authenticator,
  token: string
): Promise<FrameShareCapability | null> {
  // Invocation is workspace-member-only: external email-grant viewers hold view-only tokens.
  if (!auth.isUser()) {
    return null;
  }

  const shareResult = await FileResource.fetchByShareToken(token);
  if (shareResult.isErr()) {
    return null;
  }
  const { file, shareScope, workspace } = shareResult.value;

  if (workspace.id !== auth.getNonNullableWorkspace().id) {
    return null;
  }

  // Only workspace-visible scopes carry the capability; downgrading a frame to emails_only
  // revokes it. "workspace" is the legacy spelling of workspace_and_emails.
  if (shareScope !== "workspace_and_emails" && shareScope !== "workspace") {
    return null;
  }

  if (!file.isInteractiveContent) {
    return null;
  }

  const scope = podFunctionScopeFromFramePath(file.toScopedPath(auth));
  if (!scope) {
    return null;
  }

  return { podId: scope.podId, appPrefix: scope.appPrefix };
}
