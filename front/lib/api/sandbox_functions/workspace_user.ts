import { canWriteFrameV2Source } from "@app/lib/api/frames/permissions";
import type { SandboxFunctionInvocationErrorCode } from "@app/lib/api/sandbox_functions/errors";
import { Authenticator, getFeatureFlagsForContext } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { FrameSandboxScope } from "@app/lib/resources/frame_sandbox_adapter";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type {
  SandboxFunctionInvocationOrigin,
  SandboxFunctionUserIdentityPolicy,
} from "@app/types/api/sandbox_functions";
import type { PlanType } from "@app/types/plan";
import { isFramesV2PublicFunctionsEnabled } from "@app/types/shared/feature_flags";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";

export type SandboxFunctionAuthorization =
  | {
      authorized: true;
      kind: "workspace_user";
      user: UserResource | null;
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

type FrameServesPublicFunctionsInput = {
  workspace: WorkspaceType;
  plan: PlanType | null;
  frame: FileResource;
};

/**
 * @cc [owner:achilleburah,label:security;product] public-share-in-enabled-workspace
 * True MUST be returned only when the Frame's current share scope is `public`, the workspace
 * sharing policy is `all_scopes` and public Frame functions are enabled for it (see
 * isFramesV2PublicFunctionsEnabled). Every condition MUST be read when called, so a revoked share,
 * policy or flag refuses the next call.
 */
export async function frameServesPublicFunctions({
  workspace,
  plan,
  frame,
}: FrameServesPublicFunctionsInput): Promise<boolean> {
  const shareInfo = await frame.getShareInfo();
  if (
    shareInfo?.scope !== "public" ||
    workspace.sharingPolicy !== "all_scopes"
  ) {
    return false;
  }

  return isFramesV2PublicFunctionsEnabled(
    await getFeatureFlagsForContext(workspace, { plan })
  );
}

type AuthorizePublicFrameFunctionCallInput = FrameServesPublicFunctionsInput & {
  userIdentity: SandboxFunctionUserIdentityPolicy | null;
};

/**
 * @cc [owner:achilleburah,label:security;product] public-call-requires-public-share
 * The result MUST be authorized only when `userIdentity` is `public` and
 * frameServesPublicFunctions holds for the Frame.
 */
export async function authorizePublicFrameFunctionCall({
  workspace,
  plan,
  userIdentity,
  frame,
}: AuthorizePublicFrameFunctionCallInput): Promise<SandboxFunctionAuthorization> {
  if (userIdentity !== "public") {
    return authorizationError(
      "This Frame function requires a logged-in user from its workspace."
    );
  }

  if (!(await frameServesPublicFunctions({ workspace, plan, frame }))) {
    return authorizationError("This Frame does not serve public functions.");
  }

  return { authorized: true, kind: "anonymous", user: null, pod: null };
}

/**
 * @cc [owner:achilleburah,label:security] external-session-origin-is-a-public-call
 * When `origin` is `external_session`, the result MUST be the one of
 * authorizePublicFrameFunctionCall.
 * Any other origin MUST be refused unless the caller is a member of the workspace.
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
  if (origin === "external_session") {
    return authorizePublicFrameFunctionCall({
      workspace: auth.getNonNullableWorkspace(),
      plan: auth.plan(),
      userIdentity,
      frame: owner.frame,
    });
  }

  const user = await getAuthenticatedWorkspaceUser(auth);
  const { frame } = owner;
  let runtimeSpaceId: string;
  let pod: SpaceResource | null;

  // Any other Frame invocation is workspace-member execution, even when a declaration's identity
  // policy is optional or public. Guest rendering may still work, but invocation fails before
  // wakeup.
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
