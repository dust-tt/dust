import { evaluateWorkspaceSeatAvailability } from "@app/lib/api/workspace";
import { AuthFlowError, SSOEnforcedError } from "@app/lib/iam/errors";
import type { SessionWithUser } from "@app/lib/iam/provider";
import {
  createWorkspace,
  findWorkspaceWithVerifiedDomain,
} from "@app/lib/iam/workspaces";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { launchUpdateUsageWorkflow } from "@app/temporal/usage_queue/client";
import type {
  ActiveRoleType,
  LightWorkspaceType,
  MembershipOriginType,
  Result,
} from "@app/types";
import { Err, Ok } from "@app/types";

export async function createAndLogMembership({
  user,
  workspace,
  role,
  origin,
}: {
  user: UserResource;
  workspace: WorkspaceModel | LightWorkspaceType;
  role: ActiveRoleType;
  origin: MembershipOriginType;
}) {
  const w =
    workspace instanceof WorkspaceModel
      ? renderLightWorkspaceType({ workspace })
      : workspace;
  const m = await MembershipResource.createMembership({
    role,
    user,
    workspace: w,
    origin,
  });

  void ServerSideTracking.trackCreateMembership({
    user: user.toJSON(),
    workspace: w,
    role: m.role,
    startAt: m.startAt,
  });

  // Update workspace subscription usage when a new user joins.
  await launchUpdateUsageWorkflow({ workspaceId: workspace.sId });

  return m;
}

// `membershipInvite` flow: we know we can add the user to the associated `workspaceId` as all the
// checks (decoding the JWT) have been run before. Simply create the membership if it does not
// already exist and mark the invitation as consumed.
export async function handleMembershipInvite({
  user,
  membershipInvite,
}: {
  user: UserResource;
  membershipInvite: MembershipInvitationResource;
}): Promise<
  Result<
    {
      flow: "joined";
      workspace: LightWorkspaceType;
    },
    AuthFlowError | SSOEnforcedError
  >
> {
  if (membershipInvite.inviteEmail.toLowerCase() !== user.email.toLowerCase()) {
    logger.error(
      {
        inviteEmail: membershipInvite.inviteEmail,
        workspaceId: membershipInvite.workspaceId,
        user: user.toJSON(),
      },
      "Invitation token email mismatch"
    );

    return new Err(
      new AuthFlowError(
        "invitation_token_email_mismatch",
        "The invitation token is not intended for use with this email address."
      )
    );
  }

  const { workspace } = membershipInvite;

  if (!workspace) {
    return new Err(
      new AuthFlowError(
        "invalid_invitation_token",
        "The invite token is invalid, please ask your admin to resend an invitation."
      )
    );
  }

  if (workspace.ssoEnforced) {
    return new Err(
      new SSOEnforcedError("SSO is enforced on this workspace.", workspace.sId)
    );
  }

  const lightWorkspace = renderLightWorkspaceType({ workspace });

  const m = await MembershipResource.getLatestMembershipOfUserInWorkspace({
    user,
    workspace: lightWorkspace,
  });

  if (m?.isRevoked()) {
    const updateRes = await MembershipResource.updateMembershipRole({
      user,
      workspace: lightWorkspace,
      newRole: membershipInvite.initialRole,
      allowTerminated: true,
      author: "no-author",
    });

    if (updateRes.isErr()) {
      return new Err(
        new AuthFlowError(
          "membership_update_error",
          `Error updating previously revoked membership: ${updateRes.error.type}`
        )
      );
    }

    void ServerSideTracking.trackUpdateMembershipRole({
      user: user.toJSON(),
      workspace: lightWorkspace,
      previousRole: updateRes.value.previousRole,
      role: updateRes.value.newRole,
    });
  }

  if (!m) {
    await createAndLogMembership({
      workspace: lightWorkspace,
      user,
      role: membershipInvite.initialRole,
      origin: "invited",
    });
  }

  await membershipInvite.markAsConsumed(user);

  return new Ok({ flow: "joined", workspace: lightWorkspace });
}

export async function handleEnterpriseSignUpFlow(
  user: UserResource,
  enterpriseConnectionWorkspaceId: string
): Promise<{
  flow: "unauthorized" | "joined" | null;
  workspace: LightWorkspaceType | null;
}> {
  // Combine queries to optimize database calls.
  const [{ total }, workspace] = await Promise.all([
    MembershipResource.getActiveMemberships({
      users: [user],
    }),
    WorkspaceResource.fetchById(enterpriseConnectionWorkspaceId),
  ]);

  // Redirect to login error flow if workspace is not found.
  if (!workspace) {
    return { flow: "unauthorized", workspace: null };
  }

  const lightWorkspace = renderLightWorkspaceType({ workspace });

  // Early return if user is already a member of a workspace.
  if (total !== 0) {
    return { flow: null, workspace: lightWorkspace };
  }

  const membership =
    await MembershipResource.getLatestMembershipOfUserInWorkspace({
      user,
      workspace: lightWorkspace,
    });

  // Look if there is a pending membership invitation for the user at the workspace.
  const pendingMembershipInvitation =
    await MembershipInvitationResource.getPendingForEmailAndWorkspace({
      email: user.email,
      workspace,
    });

  // Initialize membership if it's not present or has been previously revoked. In the case of
  // enterprise connections, Dust access is overridden by the identity management service.
  if (!membership || membership.isRevoked()) {
    await createAndLogMembership({
      workspace: lightWorkspace,
      user,
      role: pendingMembershipInvitation?.initialRole ?? "user",
      origin: pendingMembershipInvitation ? "invited" : "auto-joined",
    });
  }

  if (pendingMembershipInvitation) {
    await pendingMembershipInvitation.markAsConsumed(user);
  }

  return { flow: "joined", workspace: lightWorkspace };
}

// Regular flow, only if the user is a newly created user. Verify if there's an existing workspace
// with the same verified domain that allows auto-joining. The user will join this workspace if it
// exists; otherwise, a new workspace is created.
export async function handleRegularSignupFlow(
  session: SessionWithUser,
  user: UserResource,
  activeMemberships: MembershipResource[],
  targetWorkspaceId?: string
): Promise<
  Result<
    {
      flow: "no-auto-join" | "revoked" | "joined" | null;
      workspace: LightWorkspaceType | null;
    },
    AuthFlowError | SSOEnforcedError
  >
> {
  // Return early if the user is already a member of a workspace and is not attempting to join
  // another one.
  if (activeMemberships.length > 0 && !targetWorkspaceId) {
    return new Ok({
      flow: null,
      workspace: null,
    });
  }

  const targetWorkspace = targetWorkspaceId
    ? await WorkspaceResource.fetchById(targetWorkspaceId)
    : null;

  // If user is already a member of the target workspace, return early.
  if (
    targetWorkspace &&
    activeMemberships.find((m) => m.workspaceId === targetWorkspace.id)
  ) {
    return new Ok({
      flow: null,
      workspace: renderLightWorkspaceType({ workspace: targetWorkspace }),
    });
  }

  const workspaceWithVerifiedDomain = await findWorkspaceWithVerifiedDomain(
    session.user
  );
  const { workspace: existingWorkspace } = workspaceWithVerifiedDomain ?? {};

  const joinTargetWorkspaceAllowed =
    workspaceWithVerifiedDomain &&
    existingWorkspace &&
    (!targetWorkspace || targetWorkspace.id === existingWorkspace.id);

  // Verify that the user is allowed to join the specified workspace.
  if (joinTargetWorkspaceAllowed) {
    if (existingWorkspace.ssoEnforced) {
      return new Err(
        new SSOEnforcedError(
          "SSO is enforced on this workspace.",
          existingWorkspace.sId
        )
      );
    }

    const workspaceSubscription =
      await SubscriptionResource.fetchActiveByWorkspace(
        renderLightWorkspaceType({ workspace: existingWorkspace })
      );

    if (!workspaceSubscription) {
      throw new Error("Unreachable: Workspace subscription not found");
    }

    const hasAvailableSeats = await evaluateWorkspaceSeatAvailability(
      existingWorkspace,
      workspaceSubscription.toJSON()
    );
    // Redirect to existing workspace if no seats available, requiring an invite.
    if (
      !hasAvailableSeats ||
      workspaceWithVerifiedDomain.domainAutoJoinEnabled === false
    ) {
      return new Ok({ flow: "no-auto-join", workspace: null });
    }

    const lightWorkspace = renderLightWorkspaceType({
      workspace: existingWorkspace,
    });

    const m = await MembershipResource.getLatestMembershipOfUserInWorkspace({
      user,
      workspace: lightWorkspace,
    });

    if (m?.isRevoked()) {
      return new Ok({ flow: "revoked", workspace: null });
    }

    if (!m) {
      await createAndLogMembership({
        workspace: lightWorkspace,
        user,
        role: "user",
        origin: "auto-joined",
      });
    }

    return new Ok({ flow: "joined", workspace: lightWorkspace });
  } else if (!targetWorkspace && activeMemberships.length === 0) {
    const workspace = await createWorkspace(session);
    const lightWorkspace = renderLightWorkspaceType({ workspace });
    await createAndLogMembership({
      workspace: lightWorkspace,
      user,
      role: "admin",
      origin: "auto-joined",
    });

    return new Ok({ flow: "joined", workspace: lightWorkspace });
  } else {
    // Redirect the user to their existing workspace if they are not allowed to join the target
    // workspace.
    return new Ok({ flow: null, workspace: null });
  }
}
