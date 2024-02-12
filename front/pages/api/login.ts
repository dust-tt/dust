import type { WithAPIErrorReponse } from "@dust-tt/types";
import { FrontApiError } from "@dust-tt/types";
import { verify } from "jsonwebtoken";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { getUserFromSession } from "@app/lib/auth";
import {
  Membership,
  MembershipInvitation,
  User,
  Workspace,
} from "@app/lib/models";
import { WorkspaceHasDomain } from "@app/lib/models/workspace";
import {
  internalSubscribeWorkspaceToFreeTestPlan,
  updateWorkspacePerSeatSubscriptionUsage,
} from "@app/lib/plans/subscription";
import { guessFirstandLastNameFromFullName } from "@app/lib/user";
import { generateModelSId } from "@app/lib/utils";
import { isDisposableEmailDomain } from "@app/lib/utils/disposable_email_domains";
import { apiError, withLogging } from "@app/logger/withlogging";

import { authOptions } from "./auth/[...nextauth]";

const { DUST_INVITE_TOKEN_SECRET = "" } = process.env;

function isGoogleSession(session: any) {
  return session.provider.provider === "google";
}

export async function createWorkspace(session: any) {
  const [, emailDomain] = session.user.email.split("@");

  // Use domain only when email is verified on Google Workspace and non-disposable.
  const isEmailVerified =
    isGoogleSession(session) && session.user.email_verified;
  const verifiedDomain =
    isEmailVerified && !isDisposableEmailDomain(emailDomain)
      ? emailDomain
      : null;

  const workspace = await Workspace.create({
    sId: generateModelSId(),
    name: session.user.username,
  });

  if (verifiedDomain) {
    try {
      await WorkspaceHasDomain.create({
        domain: verifiedDomain,
        domainAutoJoinEnabled: false,
        workspaceId: workspace.id,
      });
    } catch (err) {
      // `WorkspaceHasDomain` table has a unique constraint on the domain column.
      // Suppress any creation errors to prevent disruption of the login process.
    }
  }

  return workspace;
}

async function findWorkspaceWithWhitelistedDomain(session: any) {
  const { user } = session;

  if (!isGoogleSession(session) || !user.email_verified) {
    return undefined;
  }

  const [, userEmailDomain] = user.email.split("@");
  const workspaceWithWhitelistedDomain = await WorkspaceHasDomain.findOne({
    attributes: ["workspaceId"],
    where: {
      domain: userEmailDomain,
      domainAutoJoinEnabled: true,
    },
    include: [
      {
        model: Workspace,
        as: "workspace",
        required: true,
      },
    ],
  });

  return workspaceWithWhitelistedDomain?.workspace;
}

async function createOrUpdateUser(session: any): Promise<{
  isCreated: boolean;
  user: User;
}> {
  const user = await User.findOne({
    where: {
      provider: session.provider.provider,
      providerId: session.provider.id.toString(),
    },
  });

  if (user) {
    // Update the user object from the updated session information.
    user.username = session.user.username;
    user.name = session.user.name;

    // We only update the user's email if the session is not from Google.
    if (!isGoogleSession(session)) {
      user.email = session.user.email;
    }

    if (!user.firstName && !user.lastName) {
      const { firstName, lastName } = guessFirstandLastNameFromFullName(
        session.user.name
      );
      user.firstName = firstName;
      user.lastName = lastName;
    }

    await user.save();

    return {
      isCreated: false,
      user,
    };
  } else {
    const { firstName, lastName } = guessFirstandLastNameFromFullName(
      session.user.name
    );

    const user = await User.create({
      provider: session.provider.provider,
      providerId: session.provider.id.toString(),
      username: session.user.username,
      email: session.user.email,
      name: session.user.name,
      firstName,
      lastName,
    });

    return { isCreated: true, user };
  }
}

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

  membershipInvite.status = "consumed";
  membershipInvite.invitedUserId = user.id;
  await membershipInvite.save();

  return workspace;
}

// Regular flow, only if the user is a newly created user.
// Verify if there's an existing workspace with the same verified domain that allows auto-joining.
// The user will join this workspace if it exists; otherwise, a new workspace is created.
async function handleRegularSignupFlow(
  session: any,
  user: User
): Promise<Workspace> {
  const workspaceWithAutoJoinEnabled = await findWorkspaceWithWhitelistedDomain(
    session
  );

  if (workspaceWithAutoJoinEnabled) {
    const m = await Membership.findOne({
      where: {
        userId: user.id,
        workspaceId: workspaceWithAutoJoinEnabled.id,
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
        workspace: workspaceWithAutoJoinEnabled,
        userId: user.id,
        role: "user",
      });
    }

    return workspaceWithAutoJoinEnabled;
  } else {
    const workspace = await createWorkspace(session);
    await createAndLogMembership({
      workspace,
      userId: user.id,
      role: "admin",
    });

    await internalSubscribeWorkspaceToFreeTestPlan({
      workspaceId: workspace.sId,
    });

    return workspace;
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<void>>
): Promise<void> {
  const session = await getServerSession(req, res, authOptions);
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

  const { inviteToken } = req.query;

  // `membershipInvite` is set to a `MembeshipInvitation` if the query includes an
  // `inviteToken`, meaning the user is going through the invite by email flow.
  let membershipInvite: MembershipInvitation | null = null;
  if (inviteToken && typeof inviteToken === "string") {
    const decodedToken = verify(inviteToken, DUST_INVITE_TOKEN_SECRET) as {
      membershipInvitationId: number;
    };

    membershipInvite = await MembershipInvitation.findOne({
      where: {
        id: decodedToken.membershipInvitationId,
        status: "pending",
      },
    });
    if (!membershipInvite) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The invite token is invalid, please ask your admin to resend an invitation.",
        },
      });
    }
  }

  // Login flow: first step is to attempt to find the user.
  const { user, isCreated } = await createOrUpdateUser(session);

  let targetWorkspace: Workspace | null = null;
  try {
    if (membershipInvite) {
      targetWorkspace = await handleMembershipInvite(user, membershipInvite);
    } else if (isCreated) {
      targetWorkspace = await handleRegularSignupFlow(session, user);
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
    res.redirect(`/no-workspace`);
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
