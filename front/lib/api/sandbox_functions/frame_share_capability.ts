import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { podFunctionScopeFromFramePath } from "@app/types/api/pod_function_reference";
import type { FrameShareCapability } from "@app/types/api/sandbox_functions";
import { isWorkspaceVisibleShareScope } from "@app/types/files";

/**
 * A workspace member who may view a Pod app frame may invoke that app's published functions:
 * the frame is authored by the pod's members and is unusable without them, so sharing the frame
 * is sharing the app. Viewing means holding the share token for workspace-visible scopes, plus an
 * active email grant for invite-only frames. The capability grants function resolution only — it
 * never widens reads or writes on the pod, and per-function userIdentity policies still apply.
 */

/**
 * Resolve a function the way invocation-facing routes need it: by the caller's own access first,
 * and only when that misses, by the frame share token they presented. Members thus never pay the
 * token lookup, and an invalid token behaves exactly like an absent one.
 */
export async function resolveSandboxFunctionWithCapability(
  auth: Authenticator,
  functionIdOrSlug: string,
  frameShareToken: string | undefined
): Promise<SandboxFunctionResource | null> {
  const sandboxFunction = await SandboxFunctionResource.fetchByIdOrSlug(
    auth,
    functionIdOrSlug
  );
  if (sandboxFunction || !frameShareToken) {
    return sandboxFunction;
  }

  const capability = await resolveFrameShareCapability(auth, frameShareToken);
  if (!capability) {
    return null;
  }

  return SandboxFunctionResource.fetchInAppFolder(auth, {
    podId: capability.podId,
    appPrefix: capability.appPrefix,
    idOrSlug: functionIdOrSlug,
  });
}

/**
 * Validate a frame share token presented alongside a function invocation and derive the
 * capability it carries. Returns null on any mismatch.
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
  const { file, shareScope, shareableFileId, workspace } = shareResult.value;

  if (workspace.id !== auth.getNonNullableWorkspace().id) {
    return null;
  }

  // Workspace-visible scopes carry the capability for every member. An invite-only frame
  // carries it for members holding an active email grant, or for the frame's owner — the same
  // two ways the view path admits a member — so invocation access exactly follows view access,
  // and revoking a grant revokes invocation with it.
  if (!isWorkspaceVisibleShareScope(shareScope)) {
    if (shareScope !== "emails_only") {
      return null;
    }
    const user = auth.user();
    const isFileOwner = user !== null && file.userId === user.id;
    if (!isFileOwner) {
      const grant = user?.email
        ? await FileResource.getActiveGrantForEmail(workspace, {
            email: user.email,
            shareableFileId,
          })
        : null;
      if (!grant) {
        return null;
      }
    }
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
