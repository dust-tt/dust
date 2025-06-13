import { evaluateWorkspaceSeatAvailability } from "@app/lib/api/workspace";
import { AuthFlowError, SSOEnforcedError } from "@app/lib/iam/errors";
import type { SessionWithUser } from "@app/lib/iam/provider";
import {
  createWorkspace,
  findWorkspaceWithVerifiedDomain,
} from "@app/lib/iam/workspaces";
import { Workspace } from "@app/lib/models/workspace";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { launchUpdateUsageWorkflow } from "@app/temporal/usage_queue/client";
import type { ActiveRoleType, LightWorkspaceType, Result } from "@app/types";
import { Err, Ok } from "@app/types";

export async function createAndLogMembership({
  user,
  workspace,
  role,
}: {
  user: UserResource;
  workspace: Workspace | LightWorkspaceType;
  role: ActiveRoleType;
}) {
  const w =
    workspace instanceof Workspace
      ? renderLightWorkspaceType({ workspace })
      : workspace;
  const m = await MembershipResource.createMembership({
    role,
    user,
    workspace: w,
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
export async function handleMembershipInvite(
  user: UserResource,
  membershipInvite: MembershipInvitationResource
): Promise<
  Result<
    {
      flow: null;
      workspace: Workspace;
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

  const m = await MembershipResource.getLatestMembershipOfUserInWorkspace({
    user,
    workspace: renderLightWorkspaceType({ workspace }),
  });

  if (m?.isRevoked()) {
    const updateRes = await MembershipResource.updateMembershipRole({
      user,
      workspace: renderLightWorkspaceType({ workspace }),
      newRole: membershipInvite.initialRole,
      allowTerminated: true,
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
      workspace: renderLightWorkspaceType({ workspace }),
      previousRole: updateRes.value.previousRole,
      role: updateRes.value.newRole,
    });
  }

  if (!m) {
    await createAndLogMembership({
      workspace,
      user,
      role: membershipInvite.initialRole,
    });
  }

  await membershipInvite.markAsConsumed(user);

  return new Ok({ flow: null, workspace });
}

function canJoinTargetWorkspace(
  targetWorkspaceId: string | undefined,
  workspace: Workspace | undefined,
  activeMemberships: MembershipResource[]
) {
  // If there is no target workspace id, return true.
  if (!targetWorkspaceId) {
    return true;
  }

  if (!workspace) {
    return false;
  }

  // Verify that the user is not already a member of the workspace.
  const alreadyInWorkspace = activeMemberships.find(
    (m) => m.workspaceId === workspace.id
  );
  if (alreadyInWorkspace) {
    return false;
  }

  return targetWorkspaceId === workspace.sId;
}

export async function handleEnterpriseSignUpFlow(
  user: UserResource,
  enterpriseConnectionWorkspaceId: string
): Promise<{
  flow: "unauthorized" | null;
  workspace: Workspace | null;
}> {
  // Combine queries to optimize database calls.
  const [{ total }, workspace] = await Promise.all([
    MembershipResource.getActiveMemberships({
      users: [user],
    }),
    Workspace.findOne({
      where: {
        sId: enterpriseConnectionWorkspaceId,
      },
    }),
  ]);

  // Early return if user is already a member of a workspace.
  if (total !== 0) {
    return { flow: null, workspace: null };
  }

  // Redirect to login error flow if workspace is not found.
  if (!workspace) {
    return { flow: "unauthorized", workspace: null };
  }

  const membership =
    await MembershipResource.getLatestMembershipOfUserInWorkspace({
      user,
      workspace: renderLightWorkspaceType({ workspace }),
    });

  // Look if there is a pending membership invitation for the user at the workspace.
  const pendingMembershipInvitation =
    await MembershipInvitationResource.getPendingForEmailAndWorkspace(
      user.email,
      workspace.id
    );

  // Initialize membership if it's not present or has been previously revoked. In the case of
  // enterprise connections, Dust access is overridden by the identity management service.
  if (!membership || membership.isRevoked()) {
    await createAndLogMembership({
      workspace,
      user,
      role: pendingMembershipInvitation?.initialRole ?? "user",
    });
  }

  if (pendingMembershipInvitation) {
    await pendingMembershipInvitation.markAsConsumed(user);
  }

  return { flow: null, workspace };
}

// Regular flow, only if the user is a newly created user. Verify if there's an existing workspace
// with the same verified domain that allows auto-joining. The user will join this workspace if it
// exists; otherwise, a new workspace is created.
export async function handleRegularSignupFlow(
  session: SessionWithUser,
  user: UserResource,
  targetWorkspaceId?: string
): Promise<
  Result<
    {
      flow: "no-auto-join" | "revoked" | null;
      workspace: Workspace | null;
    },
    AuthFlowError | SSOEnforcedError
  >
> {
  const { memberships: activeMemberships, total } =
    await MembershipResource.getActiveMemberships({
      users: [user],
    });

  // Return early if the user is already a member of a workspace and is not attempting to join
  // another one.
  if (total !== 0 && !targetWorkspaceId) {
    return new Ok({
      flow: null,
      workspace: null,
    });
  }

  const workspaceWithVerifiedDomain = await findWorkspaceWithVerifiedDomain(
    session.user
  );
  const { workspace: existingWorkspace } = workspaceWithVerifiedDomain ?? {};

  // Verify that the user is allowed to join the specified workspace.
  const joinTargetWorkspaceAllowed = canJoinTargetWorkspace(
    targetWorkspaceId,
    existingWorkspace,
    activeMemberships
  );
  if (
    workspaceWithVerifiedDomain &&
    existingWorkspace &&
    joinTargetWorkspaceAllowed
  ) {
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

    const m = await MembershipResource.getLatestMembershipOfUserInWorkspace({
      user,
      workspace: renderLightWorkspaceType({ workspace: existingWorkspace }),
    });

    if (m?.isRevoked()) {
      return new Ok({ flow: "revoked", workspace: null });
    }

    if (!m) {
      await createAndLogMembership({
        workspace: existingWorkspace,
        user,
        role: "user",
      });
    }

    return new Ok({ flow: null, workspace: existingWorkspace });
  } else if (!targetWorkspaceId) {
    const workspace = await createWorkspace(session);
    await createAndLogMembership({
      workspace,
      user,
      role: "admin",
    });

    return new Ok({ flow: null, workspace });
  } else if (targetWorkspaceId && !canJoinTargetWorkspace) {
    return new Err(
      new AuthFlowError(
        "invalid_domain",
        "The domain attached to your email address is not authorized to join this workspace."
      )
    );
  } else {
    // Redirect the user to their existing workspace if they are not allowed to join the target
    // workspace.
    return new Ok({ flow: null, workspace: null });
  }
}
