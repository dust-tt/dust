import type {
  ActiveRoleType,
  Result,
  UserType,
  WithAPIErrorReponse,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { deleteUser } from "@app/lib/api/user";
import { evaluateWorkspaceSeatAvailability } from "@app/lib/api/workspace";
import { getSession, subscriptionForWorkspace } from "@app/lib/auth";
import { AuthFlowError, SSOEnforcedError } from "@app/lib/iam/errors";
import {
  getPendingMembershipInvitationForToken,
  markInvitationAsConsumed,
} from "@app/lib/iam/invitations";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getUserFromSession } from "@app/lib/iam/session";
import { createOrUpdateUser } from "@app/lib/iam/users";
import {
  createWorkspace,
  findWorkspaceWithVerifiedDomain,
} from "@app/lib/iam/workspaces";
import type { MembershipInvitation } from "@app/lib/models/workspace";
import { Workspace } from "@app/lib/models/workspace";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { apiError, withLogging } from "@app/logger/withlogging";
import { launchUpdateUsageWorkflow } from "@app/temporal/usage_queue/client";

// `membershipInvite` flow: we know we can add the user to the associated `workspaceId` as
// all the checks (decoding the JWT) have been run before. Simply create the membership if
// it does not already exist and mark the invitation as consumed.
async function handleMembershipInvite(
  user: UserType,
  membershipInvite: MembershipInvitation
): Promise<
  Result<
    {
      flow: null;
      workspace: Workspace;
    },
    AuthFlowError | SSOEnforcedError
  >
> {
  if (membershipInvite.inviteEmail !== user.email) {
    return new Err(
      new AuthFlowError(
        "The invitation token is not intended for use with this email address."
      )
    );
  }

  const workspace = await Workspace.findOne({
    where: {
      id: membershipInvite.workspaceId,
    },
  });

  if (!workspace) {
    return new Err(
      new AuthFlowError(
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
    return new Err(
      new AuthFlowError(
        "Your access to the workspace has expired, please contact the workspace admin to update your role."
      )
    );
  }

  if (!m) {
    await createAndLogMembership({
      workspace,
      user,
      role: membershipInvite.initialRole,
    });
  }

  await markInvitationAsConsumed(membershipInvite, user);

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

async function handleEnterpriseSignUpFlow(
  user: UserType,
  enterpriseConnectionWorkspaceId: string
): Promise<{
  flow: "unauthorized" | null;
  workspace: Workspace | null;
}> {
  // Combine queries to optimize database calls.
  const [activeMemberships, workspace] = await Promise.all([
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
  if (activeMemberships.length !== 0) {
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

  // Create membership if it does not exist.
  if (!membership) {
    await createAndLogMembership({
      workspace,
      user,
      role: "user",
    });
  } else if (membership.isRevoked()) {
    return { flow: "unauthorized", workspace: null };
  }

  return { flow: null, workspace };
}

// Regular flow, only if the user is a newly created user.
// Verify if there's an existing workspace with the same verified domain that allows auto-joining.
// The user will join this workspace if it exists; otherwise, a new workspace is created.
async function handleRegularSignupFlow(
  session: SessionWithUser,
  user: UserType,
  targetWorkspaceId?: string
): Promise<
  Result<
    {
      flow: "no-auto-join" | "revoked" | null;
      workspace: Workspace | null;
    },
    SSOEnforcedError
  >
> {
  const activeMemberships = await MembershipResource.getActiveMemberships({
    users: [user],
  });

  // Return early if the user is already a member of a workspace and is not attempting to join another one.
  if (activeMemberships.length !== 0 && !targetWorkspaceId) {
    return new Ok({
      flow: null,
      workspace: null,
    });
  }

  const workspaceWithVerifiedDomain = await findWorkspaceWithVerifiedDomain(
    session
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

    const workspaceSubscription = await subscriptionForWorkspace(
      existingWorkspace.sId
    );
    const hasAvailableSeats = await evaluateWorkspaceSeatAvailability(
      existingWorkspace,
      workspaceSubscription
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
  } else {
    // Redirect the user to their existing workspace if they are not allowed to join the target workspace.
    return new Ok({ flow: null, workspace: null });
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<void>>
): Promise<void> {
  const session = await getSession(req, res);
  if (!session) {
    res.status(401).end();
    return;
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const { inviteToken, wId } = req.query;
  const targetWorkspaceId = typeof wId === "string" ? wId : undefined;
  // Auth0 flow augments token with a claim for workspace id linked to the enterprise connection.
  const enterpriseConnectionWorkspaceId =
    session.user["https://dust.tt/workspaceId"];

  let targetWorkspace: Workspace | null = null;
  // `membershipInvite` is set to a `MembeshipInvitation` if the query includes an
  // `inviteToken`, meaning the user is going through the invite by email flow.
  const membershipInviteRes = await getPendingMembershipInvitationForToken(
    inviteToken
  );
  if (membershipInviteRes.isErr()) {
    const { error } = membershipInviteRes;

    if (error instanceof AuthFlowError) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      });
    }

    throw error;
  }

  const membershipInvite = membershipInviteRes.value;

  // Login flow: first step is to attempt to find the user.
  const { created: userCreated, user } = await createOrUpdateUser(session);

  // Prioritize enterprise connections.
  if (enterpriseConnectionWorkspaceId) {
    const { flow, workspace } = await handleEnterpriseSignUpFlow(
      user,
      enterpriseConnectionWorkspaceId
    );
    if (flow) {
      res.redirect(`/api/auth/logout?returnTo=/login-error?reason=${flow}`);
      return;
    }

    targetWorkspace = workspace;
  } else {
    const loginFctn = membershipInvite
      ? async () => handleMembershipInvite(user, membershipInvite)
      : async () => handleRegularSignupFlow(session, user, targetWorkspaceId);

    const result = await loginFctn();
    if (result.isErr()) {
      const { error } = result;

      if (error instanceof AuthFlowError) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: error.message,
          },
        });
      }

      // Delete newly created user if SSO is mandatory.
      if (userCreated) {
        await deleteUser(user);
      }

      res.redirect(
        `/api/auth/logout?returnTo=/sso-enforced?workspaceId=${error.workspaceId}`
      );
      return;
    }

    const { flow, workspace } = result.value;
    if (flow) {
      res.redirect(`/no-workspace?flow=${flow}`);
      return;
    }

    targetWorkspace = workspace;
  }

  const u = await getUserFromSession(session);
  if (!u || u.workspaces.length === 0) {
    res.redirect("/no-workspace?flow=revoked");
    return;
  }

  if (targetWorkspace) {
    // For users joining a workspace from trying to access a conversation, we redirect to this conversation after signing in.
    if (req.query.join === "true" && req.query.cId) {
      res.redirect(`/w/${targetWorkspace.sId}/welcome?cId=${req.query.cId}`);
      return;
    }
    res.redirect(`/w/${targetWorkspace.sId}/welcome`);
    return;
  }

  res.redirect(`/w/${u.workspaces[0].sId}`);

  return;
}

export async function createAndLogMembership({
  user,
  workspace,
  role,
}: {
  user: UserType;
  workspace: Workspace;
  role: ActiveRoleType;
}) {
  const m = await MembershipResource.createMembership({
    role,
    user,
    workspace: renderLightWorkspaceType({ workspace }),
  });

  // Update workspace subscription usage when a new user joins.
  await launchUpdateUsageWorkflow({ workspaceId: workspace.sId });

  return m;
}

export default withLogging(handler);
