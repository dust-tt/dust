import type {
  ActiveRoleType,
  APIErrorWithStatusCode,
  LightWorkspaceType,
  MembershipInvitationType,
  Result,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { Err, Ok, sanitizeString } from "@dust-tt/types";
import sgMail from "@sendgrid/mail";
import { sign } from "jsonwebtoken";
import { Op } from "sequelize";

import config from "@app/lib/api/config";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY } from "@app/lib/invitations";
import { MembershipInvitation } from "@app/lib/models/workspace";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { generateLegacyModelSId } from "@app/lib/resources/string_ids";
import { isEmailValid } from "@app/lib/utils";
import logger from "@app/logger/logger";

// Make token expires after 7 days
const INVITATION_EXPIRATION_TIME_SEC = 60 * 60 * 24 * 7;

function typeFromModel(
  owner: WorkspaceType,
  invitation: MembershipInvitation
): MembershipInvitationType {
  return {
    sId: invitation.sId,
    id: invitation.id,
    inviteEmail: invitation.inviteEmail,
    inviteLink: getMembershipInvitationUrl(owner, invitation.id),
    status: invitation.status,
    initialRole: invitation.initialRole,
    createdAt: invitation.createdAt.getTime(),
  };
}

export async function getInvitation(
  auth: Authenticator,
  {
    invitationId,
  }: {
    invitationId: string;
  }
): Promise<MembershipInvitationType | null> {
  const owner = auth.workspace();
  if (!owner || !auth.isAdmin()) {
    return null;
  }

  const invitation = await MembershipInvitation.findOne({
    where: {
      workspaceId: owner.id,
      sId: invitationId,
    },
  });

  if (!invitation) {
    return null;
  }

  return typeFromModel(owner, invitation);
}

export async function updateInvitationStatusAndRole(
  auth: Authenticator,
  {
    invitation,
    status,
    role,
  }: {
    invitation: MembershipInvitationType;
    status: "pending" | "consumed" | "revoked";
    role: ActiveRoleType;
  }
): Promise<MembershipInvitationType> {
  const owner = auth.workspace();
  if (!owner || !auth.isAdmin()) {
    throw new Error("Unauthorized attempt to update invitation status.");
  }

  const existingInvitation = await MembershipInvitation.findOne({
    where: {
      workspaceId: owner.id,
      id: invitation.id,
    },
  });

  if (!existingInvitation) {
    throw new Err("Invitation unexpectedly not found.");
  }

  await existingInvitation.update({
    status: status,
    initialRole: role,
  });

  return typeFromModel(owner, existingInvitation);
}

export async function updateOrCreateInvitation(
  owner: WorkspaceType,
  inviteEmail: string,
  initialRole: ActiveRoleType
): Promise<MembershipInvitationType> {
  // check for prior existing pending invitation
  const existingInvitation = await MembershipInvitation.findOne({
    where: {
      workspaceId: owner.id,
      inviteEmail: sanitizeString(inviteEmail),
      status: "pending",
    },
  });

  if (existingInvitation) {
    await existingInvitation.update({
      initialRole,
    });
    return typeFromModel(owner, existingInvitation);
  }

  return typeFromModel(
    owner,
    await MembershipInvitation.create({
      sId: generateLegacyModelSId(),
      workspaceId: owner.id,
      inviteEmail: sanitizeString(inviteEmail),
      status: "pending",
      initialRole,
    })
  );
}

function getMembershipInvitationToken(invitationId: number) {
  return sign(
    {
      membershipInvitationId: invitationId,
      exp: Math.floor(Date.now() / 1000) + INVITATION_EXPIRATION_TIME_SEC,
    },
    config.getDustInviteTokenSecret()
  );
}

function getMembershipInvitationUrlForToken(
  owner: LightWorkspaceType,
  invitationToken: string
) {
  return `${config.getClientFacingUrl()}/w/${owner.sId}/join/?t=${invitationToken}`;
}

export function getMembershipInvitationUrl(
  owner: LightWorkspaceType,
  invitationId: number
) {
  const invitationToken = getMembershipInvitationToken(invitationId);
  return getMembershipInvitationUrlForToken(owner, invitationToken);
}

export async function sendWorkspaceInvitationEmail(
  owner: WorkspaceType,
  user: UserType,
  invitation: MembershipInvitationType
) {
  // Send invite email.
  const message = {
    to: invitation.inviteEmail,
    from: {
      name: "Dust team",
      email: "team@dust.tt",
    },
    templateId: config.getInvitationEmailTemplate(),
    dynamic_template_data: {
      inviteLink: invitation.inviteLink,
      inviterName: user.fullName,
      workspaceName: owner.name,
    },
  };

  sgMail.setApiKey(config.getSendgridApiKey());
  await sgMail.send(message);
}
/**
 * Returns the pending inviations associated with the authenticator's owner workspace.
 * @param auth Authenticator
 * @returns MenbershipInvitation[] members of the workspace
 */

export async function getPendingInvitations(
  auth: Authenticator
): Promise<MembershipInvitationType[]> {
  const owner = auth.workspace();
  if (!owner) {
    return [];
  }
  if (!auth.isAdmin()) {
    throw new Error(
      "Only users that are `admins` for the current workspace can see membership invitations or modify it."
    );
  }

  const invitations = await MembershipInvitation.findAll({
    where: {
      workspaceId: owner.id,
      status: "pending",
    },
  });

  return invitations.map((i) => {
    return {
      sId: i.sId,
      id: i.id,
      status: i.status,
      inviteEmail: i.inviteEmail,
      inviteLink: getMembershipInvitationUrl(owner, i.id),
      initialRole: i.initialRole,
      createdAt: i.createdAt.getTime(),
    };
  });
}

/**
 * Returns the pending or revoked inviations that were created today
 *  associated with the authenticator's owner workspace.
 * @param auth Authenticator
 * @returns MenbershipInvitation[] members of the workspace
 */

export async function getRecentPendingAndRevokedInvitations(
  auth: Authenticator
): Promise<{
  pending: MembershipInvitationType[];
  revoked: MembershipInvitationType[];
}> {
  const owner = auth.workspace();
  if (!owner) {
    return {
      pending: [],
      revoked: [],
    };
  }
  if (!auth.isAdmin()) {
    throw new Error(
      "Only users that are `admins` for the current workspace can see membership invitations or modify it."
    );
  }
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  const invitations = await MembershipInvitation.findAll({
    where: {
      workspaceId: owner.id,
      status: ["pending", "revoked"],
      createdAt: {
        [Op.gt]: oneDayAgo,
      },
    },
  });

  const groupedInvitations: Record<
    "pending" | "revoked",
    MembershipInvitationType[]
  > = {
    revoked: [],
    pending: [],
  };

  for (const i of invitations) {
    const status = i.status as "pending" | "revoked";
    groupedInvitations[status].push({
      sId: i.sId,
      id: i.id,
      status,
      inviteEmail: i.inviteEmail,
      inviteLink: getMembershipInvitationUrl(owner, i.id),
      initialRole: i.initialRole,
      createdAt: i.createdAt.getTime(),
    });
  }

  return groupedInvitations;
}

export async function batchUnrevokeInvitations(
  auth: Authenticator,
  invitationIds: string[]
) {
  const owner = auth.workspace();
  if (!owner || !auth.isAdmin()) {
    throw new Error(
      "Only users that are `admins` for the current workspace can see membership invitations or modify them."
    );
  }

  await MembershipInvitation.update(
    {
      status: "pending",
    },
    {
      where: {
        sId: {
          [Op.in]: invitationIds,
        },
        workspaceId: owner.id,
      },
    }
  );
}

interface MembershipInvitationBlob {
  email: string;
  role: ActiveRoleType;
}

interface HandleMembershipInvitationResult {
  success: boolean;
  email: string;
  error_message?: string;
}

export async function handleMembershipInvitations(
  auth: Authenticator,
  {
    invitationRequests,
    owner,
    subscription,
    user,
  }: {
    owner: WorkspaceType;
    subscription: SubscriptionType;
    user: UserType;
    invitationRequests: MembershipInvitationBlob[];
  }
): Promise<Result<HandleMembershipInvitationResult[], APIErrorWithStatusCode>> {
  const { maxUsers } = subscription.plan.limits.users;
  const availableSeats =
    maxUsers -
    (await MembershipResource.getMembersCountForWorkspace({
      workspace: owner,
      activeOnly: true,
    }));
  if (maxUsers !== -1 && availableSeats < invitationRequests.length) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "plan_limit_error",
        message: `Not enough seats lefts (${availableSeats} seats remaining). Please upgrade or remove inactive members to add more.`,
      },
    });
  }

  const invalidEmails = invitationRequests.filter(
    (b) => !isEmailValid(b.email)
  );
  if (invalidEmails.length > 0) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid email address(es): " + invalidEmails.join(", "),
      },
    });
  }

  const existingMembers = await getMembers(auth, { activeOnly: true });
  const unconsumedInvitations =
    await getRecentPendingAndRevokedInvitations(auth);
  if (
    unconsumedInvitations.pending.length >=
    MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY
  ) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Too many pending invitations. Please ask your members to consume their invitations before sending more.`,
      },
    });
  }

  const emailsWithRecentUnconsumedInvitations = new Set([
    ...unconsumedInvitations.pending.map((i) =>
      i.inviteEmail.toLowerCase().trim()
    ),
    ...unconsumedInvitations.revoked.map((i) =>
      i.inviteEmail.toLowerCase().trim()
    ),
  ]);
  const requestedEmails = new Set(
    invitationRequests.map((r) => r.email.toLowerCase().trim())
  );
  const emailsToSendInvitations = invitationRequests.filter(
    (r) =>
      !emailsWithRecentUnconsumedInvitations.has(r.email.toLowerCase().trim())
  );
  const invitationsToUnrevoke = unconsumedInvitations.revoked.filter((i) =>
    requestedEmails.has(i.inviteEmail.toLowerCase().trim())
  );

  if (
    !emailsToSendInvitations.length &&
    !invitationsToUnrevoke.length &&
    invitationRequests.length > 0
  ) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invitation_already_sent_recently",
        message: `These emails have already received an invitation in the last 24 hours. Please wait before sending another invitation.`,
      },
    });
  }
  await batchUnrevokeInvitations(
    auth,
    invitationsToUnrevoke.map((i) => i.sId)
  );
  const invitationResults = await Promise.all(
    emailsToSendInvitations.map(async ({ email, role }) => {
      if (existingMembers.find((m) => m.email === email)) {
        return {
          success: false,
          email,
          error_message: "Cannot send invitation to existing active member.",
        };
      }

      try {
        const invitation = await updateOrCreateInvitation(owner, email, role);
        await sendWorkspaceInvitationEmail(owner, user, invitation);
      } catch (e) {
        logger.error(
          {
            error: e,
            message: "Failed to send invitation email",
            email,
          },
          "Failed to send invitation email"
        );

        return {
          success: false,
          email,
          error_message: e instanceof Error ? e.message : "Unknown error",
        };
      }
      return {
        success: true,
        email,
      };
    })
  );

  return new Ok(invitationResults);
}
