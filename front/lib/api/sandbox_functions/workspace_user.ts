import { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type {
  SandboxFunctionInvocationOrigin,
  SandboxFunctionUserIdentityPolicy,
} from "@app/types/api/sandbox_functions";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";

type SandboxFunctionAuthorization =
  | {
      authorized: true;
      user: UserResource | null;
      runtimeSpaceId: string;
      pod: SpaceResource | null;
    }
  | { authorized: false; errorMessage: string };

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

export async function authorizeSandboxFunctionInvocation(
  auth: Authenticator,
  {
    userIdentity,
    origin,
    owner,
  }: {
    userIdentity: SandboxFunctionUserIdentityPolicy | null;
    origin: SandboxFunctionInvocationOrigin;
    owner:
      | { kind: "pod"; space: SpaceResource }
      | { kind: "frame"; frame: FileResource };
  }
): Promise<SandboxFunctionAuthorization> {
  const user = await getAuthenticatedWorkspaceUser(auth);
  const frame = owner.kind === "frame" ? owner.frame : null;
  let runtimeSpaceId: string;
  let pod: SpaceResource | null;
  if (owner.kind === "frame") {
    const { frame } = owner;
    // Frames are always workspace-member execution, even when a declaration's identity policy is
    // optional. Public and guest rendering may still work, but invocation fails before wakeup.
    if (!user) {
      return {
        authorized: false,
        errorMessage:
          "This Frame function requires a logged-in user from its workspace.",
      };
    }
    const scope = await frame.resolveFrameScopedPathContext(auth);
    if (!scope.spaceId) {
      return {
        authorized: false,
        errorMessage: "This Frame has no valid runtime scope.",
      };
    }
    const runtimeSpace = await SpaceResource.fetchById(auth, scope.spaceId);
    if (!runtimeSpace) {
      return {
        authorized: false,
        errorMessage: "This Frame's runtime scope no longer exists.",
      };
    }
    runtimeSpaceId = runtimeSpace.sId;
    pod = runtimeSpace.isProject() ? runtimeSpace : null;
  } else {
    pod = owner.space;
    runtimeSpaceId = pod.sId;
  }

  const functionKind = frame ? "Frame function" : "Pod Function";
  const policy = userIdentity ?? "optional";
  switch (policy) {
    case "optional":
      return { authorized: true, user, runtimeSpaceId, pod };
    case "workspace_user_required":
      return user
        ? { authorized: true, user, runtimeSpaceId, pod }
        : {
            authorized: false,
            errorMessage: `This ${functionKind} requires a logged-in user from its workspace.`,
          };
    case "interactive_workspace_user_required": {
      const authorized =
        user !== null &&
        origin === "interactive_session" &&
        auth.authMethod() === "session";
      return authorized
        ? { authorized: true, user, runtimeSpaceId, pod }
        : {
            authorized: false,
            errorMessage: `This ${functionKind} requires a logged-in workspace member in a live Dust session.`,
          };
    }
    case "pod_member_required": {
      // Membership means belonging to any of the pod's groups (member or editor — a user is never
      // in both): the people who hold write on the pod and can publish its functions. Workspace
      // admins outside those groups cannot write to the pod, so they are deliberately not
      // authorized. `canRead` would not do either: open pods grant read to the whole workspace, so
      // it cannot separate members from bystanders.
      const authorized = user !== null && pod?.isMember(auth) === true;
      return authorized
        ? { authorized: true, user, runtimeSpaceId, pod }
        : {
            authorized: false,
            errorMessage: `This ${functionKind} requires a member of its Pod.`,
          };
    }
    default:
      // The policy is persisted as a plain string, so the store can hold a value this revision
      // does not know: one from a newer revision in a mixed-version deploy, or a retired policy
      // (e.g. `pod_editor_required`) that predates its removal. Deny rather than throw so both
      // fail closed; a retired policy is repaired by republishing with a supported one.
      // `assertNeverAndIgnore` (not `assertNever`) is deliberate although this is server code:
      // the value is cross-revision data, not internal control flow, and throwing would turn
      // these invocations into 500s instead of this clean denial.
      assertNeverAndIgnore(policy);
      return {
        authorized: false,
        errorMessage: `This ${functionKind} uses an unsupported user identity policy.`,
      };
  }
}
