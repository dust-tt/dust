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
export async function handleMembershipInvite(
  user: UserResource,
  membershipInvite: MembershipInvitationResource
): Promise<
  Result<
    {
      flow: "joined";
      workspace: WorkspaceModel;
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
      origin: "invited",
    });
  }

  await membershipInvite.markAsConsumed(user);

  return new Ok({ flow: "joined", workspace });
}

export async function handleEnterpriseSignUpFlow(
  user: UserResource,
  enterpriseConnectionWorkspaceId: string
): Promise<{
  flow: "unauthorized" | "joined" | null;
  workspace: WorkspaceModel | null;
}> {
  // Combine queries to optimize database calls.
  const [{ total }, workspace] = await Promise.all([
    MembershipResource.getActiveMemberships({
      users: [user],
    }),
    WorkspaceModel.findOne({
      where: {
        sId: enterpriseConnectionWorkspaceId,
      },
    }),
  ]);

  // Redirect to login error flow if workspace is not found.
  if (!workspace) {
    return { flow: "unauthorized", workspace: null };
  }

  // Early return if user is already a member of a workspace.
  if (total !== 0) {
    return { flow: null, workspace };
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
      origin: pendingMembershipInvitation ? "invited" : "auto-joined",
    });
  }

  if (pendingMembershipInvitation) {
    await pendingMembershipInvitation.markAsConsumed(user);
  }

  return { flow: "joined", workspace };
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
      flow: "no-auto-join" | "revoked" | "joined" | null;
      workspace: WorkspaceModel | null;
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

  const targetWorkspace = targetWorkspaceId
    ? await WorkspaceModel.findOne({
        where: {
          sId: targetWorkspaceId,
        },
      })
    : null;

  // If user is already a member of the target workspace, return early.
  if (
    targetWorkspace &&
    activeMemberships.find((m) => m.workspaceId === targetWorkspace.id)
  ) {
    return new Ok({ flow: null, workspace: targetWorkspace });
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
        origin: "auto-joined",
      });
    }

    return new Ok({ flow: "joined", workspace: existingWorkspace });
  } else if (!targetWorkspace) {
    const workspace = await createWorkspace(session);
    await createAndLogMembership({
      workspace,
      user,
      role: "admin",
      origin: "auto-joined",
    });

    return new Ok({ flow: "joined", workspace });
  } else {
    return new Err(
      new AuthFlowError(
        "invalid_domain",
        "The domain attached to your email address is not authorized to join this workspace."
      )
    );
  }
}
