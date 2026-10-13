import { canWriteFrameV2Source } from "@app/lib/api/frames/permissions";
import { canServePublicFrameFunctions } from "@app/lib/api/frames/public_frame_functions_policy";
import type { SandboxFunctionInvocationErrorCode } from "@app/lib/api/sandbox_functions/errors";
import { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { FrameSandboxScope } from "@app/lib/resources/frame_sandbox_adapter";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type {
  SandboxFunctionInvocationOrigin,
  SandboxFunctionUserIdentityPolicy,
} from "@app/types/api/sandbox_functions";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";

export type SandboxFunctionAuthorization =
  | {
      authorized: true;
      kind: "workspace_user";
      user: UserResource;
      runtimeSpaceId: string;
      pod: SpaceResource | null;
    }
  | {
      authorized: true;
      kind: "anonymous";
      user: null;
      pod: null;
    }
  | {
      authorized: false;
      errorCode: SandboxFunctionInvocationErrorCode;
      errorMessage: string;
    };

function authorizationError(
  errorMessage: string,
  errorCode: SandboxFunctionInvocationErrorCode = "user_authentication_required"
): SandboxFunctionAuthorization {
  return { authorized: false, errorCode, errorMessage };
}

export async function getAuthenticatedWorkspaceUser(
  auth: Authenticator
): Promise<UserResource | null> {
  const user = auth.user();
  if (!user) {
    return null;
  }

  const role = await MembershipResource.getActiveRoleForUserInWorkspace({
    user,
    workspace: auth.getNonNullableWorkspace(),
  });

  return Authenticator.isMember(role) ? user : null;
}

type AuthorizeAnonymousSandboxFunctionCallerInput = {
  userIdentity: SandboxFunctionUserIdentityPolicy | null;
  origin: SandboxFunctionInvocationOrigin;
  frame: FileResource;
};

/**
 * @cc [owner:achilleburah,label:security;product] caller-check-is-scope-independent
 * The result MUST NOT depend on the Frame's runtime scope, so `execute()` can run it before any
 * sandbox wakeup.
 */
export async function authorizeAnonymousSandboxFunctionCaller(
  auth: Authenticator,
  { userIdentity, origin, frame }: AuthorizeAnonymousSandboxFunctionCallerInput
): Promise<SandboxFunctionAuthorization> {
  if (origin !== "anonymous" || userIdentity !== "public") {
    return authorizationError(
      "This Frame function requires a logged-in user from its workspace."
    );
  }

  const shareInfo = await frame.getShareInfo();
  if (
    !shareInfo ||
    !(await canServePublicFrameFunctions(auth, shareInfo.scope))
  ) {
    return authorizationError("This Frame does not serve public functions.");
  }

  return { authorized: true, kind: "anonymous", user: null, pod: null };
}

/**
 * @cc [owner:achilleburah,label:security;product] anonymous-is-the-only-userless-invoker
 * A caller without a workspace membership MUST be denied unless its Authenticator has the
 * `anonymous` auth method. Such a caller MUST be denied unless the invocation origin is
 * `anonymous`, the function is `public` and `canServePublicFrameFunctions` holds for the Frame's
 * current share scope, read when called so a revoked share refuses the next call.
 */
export async function authorizeSandboxFunctionInvocation(
  auth: Authenticator,
  {
    userIdentity,
    origin,
    owner,
  }: {
    userIdentity: SandboxFunctionUserIdentityPolicy | null;
    origin: SandboxFunctionInvocationOrigin;
    owner: {
      kind: "frame";
      frame: FileResource;
      scope?: FrameSandboxScope;
    };
  }
): Promise<SandboxFunctionAuthorization> {
  if (auth.authMethod() === "anonymous") {
    return authorizeAnonymousSandboxFunctionCaller(auth, {
      userIdentity,
      origin,
      frame: owner.frame,
    });
  }

  const user = await getAuthenticatedWorkspaceUser(auth);
  const { frame } = owner;
  let runtimeSpaceId: string;
  let pod: SpaceResource | null;

  // Any other Frame caller must be a workspace member, even when a declaration's identity policy
  // is optional. Guest rendering may still work, but invocation fails before wakeup.
  if (!user) {
    return authorizationError(
      "This Frame function requires a logged-in user from its workspace."
    );
  }
  const scope =
    owner.scope ?? (await frame.resolveFrameScopedPathContext(auth));
  if (scope.spaceId) {
    const runtimeSpace = await SpaceResource.fetchById(auth, scope.spaceId);
    if (!runtimeSpace) {
      return authorizationError(
        "This Frame's runtime scope no longer exists.",
        "frame_runtime_unavailable"
      );
    }
    runtimeSpaceId = runtimeSpace.sId;
    pod = runtimeSpace.isProject() ? runtimeSpace : null;
  } else {
    // Standalone conversations have no space. Their functions still need a space claim so
    // sandbox tokens can expose workspace-level MCP servers; the global space is that scope.
    const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
    runtimeSpaceId = globalSpace.sId;
    pod = null;
  }

  // Every policy below is evaluated for a workspace member: the guard above already refused
  // anyone else, so these only add the requirement on top of membership.
  const policy = userIdentity ?? "optional";
  switch (policy) {
    case "public":
    case "optional":
    case "workspace_user_required":
      return {
        authorized: true,
        kind: "workspace_user",
        user,
        runtimeSpaceId,
        pod,
      };
    case "interactive_workspace_user_required": {
      const authorized =
        origin === "interactive_session" && auth.authMethod() === "session";
      return authorized
        ? {
            authorized: true,
            kind: "workspace_user",
            user,
            runtimeSpaceId,
            pod,
          }
        : authorizationError(
            "This Frame function requires a logged-in workspace member in a live Dust session."
          );
    }
    case "frame_author_required": {
      return (await canWriteFrameV2Source(auth, frame))
        ? {
            authorized: true,
            kind: "workspace_user",
            user,
            runtimeSpaceId,
            pod,
          }
        : authorizationError(
            "This Frame function requires permission to modify its source files."
          );
    }
    default:
      // The policy is persisted as a plain string, so the store can hold a value this revision
      // does not know: one from a newer revision in a mixed-version deploy, or a retired policy
      // (e.g. `pod_member_required`) that predates its removal. Deny rather than throw so both
      // fail closed; a retired policy is repaired by republishing with a supported one.
      // `assertNeverAndIgnore` (not `assertNever`) is deliberate although this is server code:
      // the value is cross-revision data, not internal control flow, and throwing would turn
      // these invocations into 500s instead of this clean denial.
      assertNeverAndIgnore(policy);
      return authorizationError(
        "This Frame function uses an unsupported user identity policy."
      );
  }
}
