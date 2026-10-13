import { canWriteFrameV2Source } from "@app/lib/api/frames/permissions";
import type { SandboxFunctionInvocationErrorCode } from "@app/lib/api/sandbox_functions/errors";
import { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { FrameSandboxScope } from "@app/lib/resources/frame_sandbox_adapter";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type {
  SandboxFunctionExecutionMode,
  SandboxFunctionInvocationOrigin,
  SandboxFunctionUserIdentityPolicy,
} from "@app/types/api/sandbox_functions";
import {
  assertNever,
  assertNeverAndIgnore,
} from "@app/types/shared/utils/assert_never";

export type SandboxFunctionAuthorization =
  | {
      authorized: true;
      user: UserResource | null;
      runtimeSpaceId: string;
      pod: SpaceResource | null;
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

export type SandboxFunctionCaller =
  | { kind: "workspace_member"; user: UserResource }
  | {
      kind: "denied";
      errorCode: SandboxFunctionInvocationErrorCode;
      errorMessage: string;
    };

export type CheckSandboxFunctionCallerInput = {
  userIdentity: SandboxFunctionUserIdentityPolicy | null;
  executionMode: SandboxFunctionExecutionMode;
};

/**
 * @cc [owner:achilleburah,label:security;product] caller-check-is-scope-independent
 * The caller MUST be denied unless it is a workspace member, and a `public` function MUST be denied
 * unless its execution mode is `fast`. The check MUST NOT depend on the Frame's runtime scope, so
 * `execute()` can run it before any sandbox wakeup.
 */
export async function checkSandboxFunctionCaller(
  auth: Authenticator,
  { userIdentity, executionMode }: CheckSandboxFunctionCallerInput
): Promise<SandboxFunctionCaller> {
  if (userIdentity === "public" && executionMode !== "fast") {
    return {
      kind: "denied",
      errorCode: "user_authentication_required",
      errorMessage:
        "This public Frame function must declare the fast execution mode.",
    };
  }

  const user = await getAuthenticatedWorkspaceUser(auth);
  return user
    ? { kind: "workspace_member", user }
    : {
        kind: "denied",
        errorCode: "user_authentication_required",
        errorMessage:
          "This Frame function requires a logged-in user from its workspace.",
      };
}

type SandboxFunctionInvocationOwner = {
  kind: "frame";
  frame: FileResource;
  scope?: FrameSandboxScope;
};

async function resolveMemberRuntime(
  auth: Authenticator,
  user: UserResource,
  owner: SandboxFunctionInvocationOwner
): Promise<SandboxFunctionAuthorization> {
  const { frame } = owner;
  const scope =
    owner.scope ?? (await frame.resolveFrameScopedPathContext(auth));
  if (!scope.spaceId) {
    // Standalone conversations have no space. Their functions still need a space claim so
    // sandbox tokens can expose workspace-level MCP servers; the global space is that scope.
    const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
    return {
      authorized: true,
      user,
      runtimeSpaceId: globalSpace.sId,
      pod: null,
    };
  }

  const runtimeSpace = await SpaceResource.fetchById(auth, scope.spaceId);
  if (!runtimeSpace) {
    return authorizationError(
      "This Frame's runtime scope no longer exists.",
      "frame_runtime_unavailable"
    );
  }
  return {
    authorized: true,
    user,
    runtimeSpaceId: runtimeSpace.sId,
    pod: runtimeSpace.isProject() ? runtimeSpace : null,
  };
}

type AuthorizeWorkspaceMemberInput = {
  userIdentity: SandboxFunctionUserIdentityPolicy | null;
  origin: SandboxFunctionInvocationOrigin;
  owner: SandboxFunctionInvocationOwner;
};

async function authorizeWorkspaceMember(
  auth: Authenticator,
  user: UserResource,
  { userIdentity, origin, owner }: AuthorizeWorkspaceMemberInput
): Promise<SandboxFunctionAuthorization> {
  const policy = userIdentity ?? "optional";
  switch (policy) {
    case "public":
    case "optional":
    case "workspace_user_required":
      return resolveMemberRuntime(auth, user, owner);
    case "interactive_workspace_user_required": {
      const authorization = await resolveMemberRuntime(auth, user, owner);
      if (!authorization.authorized) {
        return authorization;
      }
      return origin === "interactive_session" && auth.authMethod() === "session"
        ? authorization
        : authorizationError(
            "This Frame function requires a logged-in workspace member in a live Dust session."
          );
    }
    case "frame_author_required": {
      const authorization = await resolveMemberRuntime(auth, user, owner);
      if (!authorization.authorized) {
        return authorization;
      }
      return (await canWriteFrameV2Source(auth, owner.frame))
        ? authorization
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

export type AuthorizeSandboxFunctionInvocationInput = {
  userIdentity: SandboxFunctionUserIdentityPolicy | null;
  executionMode: SandboxFunctionExecutionMode;
  origin: SandboxFunctionInvocationOrigin;
  owner: SandboxFunctionInvocationOwner;
};

/**
 * @cc [owner:achilleburah,label:security;product] each-policy-decides-its-callers
 * Every caller MUST first pass `checkSandboxFunctionCaller`. On top of it,
 * `interactive_workspace_user_required` MUST require a live Dust session and
 * `frame_author_required` write access to the Frame source. A policy this revision does not know
 * MUST be denied.
 */
export async function authorizeSandboxFunctionInvocation(
  auth: Authenticator,
  {
    userIdentity,
    executionMode,
    origin,
    owner,
  }: AuthorizeSandboxFunctionInvocationInput
): Promise<SandboxFunctionAuthorization> {
  const caller = await checkSandboxFunctionCaller(auth, {
    userIdentity,
    executionMode,
  });
  switch (caller.kind) {
    case "denied":
      return authorizationError(caller.errorMessage, caller.errorCode);
    case "workspace_member":
      return authorizeWorkspaceMember(auth, caller.user, {
        userIdentity,
        origin,
        owner,
      });
    default:
      return assertNever(caller);
  }
}
