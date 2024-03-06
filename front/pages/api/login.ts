import type { WithAPIErrorReponse } from "@dust-tt/types";
import { FrontApiError } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { evaluateWorkspaceSeatAvailability } from "@app/lib/api/workspace";
import { getSession, subscriptionForWorkspace } from "@app/lib/auth";
import {
  getPendingMembershipInvitationForToken,
  markInvitationAsConsumed,
} from "@app/lib/iam/invitations";
import { getActiveMembershipsForUser } from "@app/lib/iam/memberships";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getUserFromSession } from "@app/lib/iam/session";
import { createOrUpdateUser } from "@app/lib/iam/users";
import {
  createWorkspace,
  findWorkspaceWithVerifiedDomain,
} from "@app/lib/iam/workspaces";
import type { MembershipInvitation, User } from "@app/lib/models";
import { Membership, Workspace } from "@app/lib/models";
import {
  internalSubscribeWorkspaceToFreeTestPlan,
  updateWorkspacePerSeatSubscriptionUsage,
} from "@app/lib/plans/subscription";
import { apiError, withLogging } from "@app/logger/withlogging";

// `membershipInvite` flow: we know we can add the user to the associated `workspaceId` as
// all the checks (decoding the JWT) have been run before. Simply create the membership if
// it does not already exist and mark the invitation as consumed.
async function handleMembershipInvite(
  user: User,
  membershipInvite: MembershipInvitation
) {
  if (membershipInvite.inviteEmail !== user.email) {
    throw new FrontApiError(
      "The invitation token is not intended for use with this email address.",
      400,
      "invalid_request_error"
    );
  }

  const workspace = await Workspace.findOne({
    where: {
      id: membershipInvite.workspaceId,
    },
  });

  if (!workspace) {
    throw new FrontApiError(
      "The invite token is invalid, please ask your admin to resend an invitation.",
      400,
      "invalid_request_error"
    );
  }

  const m = await Membership.findOne({
    where: {
      userId: user.id,
      workspaceId: membershipInvite.workspaceId,
    },
  });

  if (m?.role === "revoked") {
    throw new FrontApiError(
      "Your access to the workspace has been revoked, please contact the workspace admin to update your role.",
      400,
      "invalid_request_error"
    );
  }

  if (!m) {
    await createAndLogMembership({
      workspace: workspace,
      userId: user.id,
      role: "user",
    });
  }

  await markInvitationAsConsumed(membershipInvite, user);

  return workspace;
}

function canJoinTargetWorkspace(
  targetWorkspaceId: string | undefined,
  workspace: Workspace | undefined,
  activeMemberships: Membership[]
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

// Regular flow, only if the user is a newly created user.
// Verify if there's an existing workspace with the same verified domain that allows auto-joining.
// The user will join this workspace if it exists; otherwise, a new workspace is created.
async function handleRegularSignupFlow(
  session: SessionWithUser,
  user: User,
  targetWorkspaceId?: string
): Promise<{
  flow: "no-auto-join" | "revoked" | null;
  workspace: Workspace | null;
}> {
  const activeMemberships = await getActiveMembershipsForUser(user.id);
  // Return early if the user is already a member of a workspace and is not attempting to join another one.
  if (activeMemberships.length !== 0 && !targetWorkspaceId) {
    return {
      flow: null,
      workspace: null,
    };
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
    const workspaceSubscription = await subscriptionForWorkspace(
      existingWorkspace
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
      return { flow: "no-auto-join", workspace: null };
    }

    const m = await Membership.findOne({
      where: {
        userId: user.id,
        workspaceId: existingWorkspace.id,
      },
    });

    if (m?.role === "revoked") {
      return { flow: "revoked", workspace: null };
    }

    if (!m) {
      await createAndLogMembership({
        workspace: existingWorkspace,
        userId: user.id,
        role: "user",
      });
    }

    return { flow: null, workspace: existingWorkspace };
  } else if (!targetWorkspaceId) {
    const workspace = await createWorkspace(session);
    await createAndLogMembership({
      workspace,
      userId: user.id,
      role: "admin",
    });

    await internalSubscribeWorkspaceToFreeTestPlan({
      workspaceId: workspace.sId,
    });

    return { flow: null, workspace };
  } else {
    // Redirect the user to their existing workspace if they are not allowed to join the target workspace.
    return { flow: null, workspace: null };
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

  let targetWorkspace: Workspace | null = null;
  try {
    // `membershipInvite` is set to a `MembeshipInvitation` if the query includes an
    // `inviteToken`, meaning the user is going through the invite by email flow.
    const membershipInvite = await getPendingMembershipInvitationForToken(
      inviteToken
    );

    // Login flow: first step is to attempt to find the user.
    const user = await createOrUpdateUser(session);

    if (membershipInvite) {
      targetWorkspace = await handleMembershipInvite(user, membershipInvite);
    } else {
      const { flow, workspace } = await handleRegularSignupFlow(
        session,
        user,
        targetWorkspaceId
      );
      if (flow) {
        res.redirect(`/no-workspace?flow=${flow}`);
        return;
      }

      targetWorkspace = workspace;
    }
  } catch (err) {
    if (err instanceof FrontApiError) {
      return apiError(req, res, {
        status_code: err.statusCode,
        api_error: {
          type: err.type,
          message: err.message,
        },
      });
    }
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
  userId,
  workspace,
  role,
}: {
  userId: number;
  workspace: Workspace;
  role: "admin" | "user";
}) {
  const m = await Membership.create({
    role: role,
    userId: userId,
    workspaceId: workspace.id,
  });

  // If the user is joining a workspace with a subscription based on per_seat,
  // we need to update the Stripe subscription quantity.
  void updateWorkspacePerSeatSubscriptionUsage({ workspaceId: workspace.sId });

  return m;
}

export default withLogging(handler);
