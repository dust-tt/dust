import sgMail from "@sendgrid/mail";
import { escape } from "html-escaper";
import { sign } from "jsonwebtoken";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

import config from "@app/lib/api/config";
import {
  getMembers,
  getWorkspaceAdministrationVersionLock,
} from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { INVITATION_EXPIRATION_TIME_SEC } from "@app/lib/constants/invitation";
import { MAX_UNCONSUMED_INVITATIONS_PER_WORKSPACE_PER_DAY } from "@app/lib/invitations";
import { MembershipInvitationModel } from "@app/lib/models/membership_invitation";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { isEmailValid } from "@app/lib/utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type {
  ActiveRoleType,
  APIErrorWithStatusCode,
  LightWorkspaceType,
  MembershipInvitationType,
  ModelId,
  Result,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@app/types";
import { Err, Ok, sanitizeString } from "@app/types";

function typeFromModel(
  invitation: MembershipInvitationModel
): MembershipInvitationType {
  return {
    sId: invitation.sId,
    id: invitation.id,
    inviteEmail: invitation.inviteEmail,
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

  const invitation = await MembershipInvitationModel.findOne({
    where: {
      workspaceId: owner.id,
      sId: invitationId,
    },
  });

  if (!invitation) {
    return null;
  }

  return typeFromModel(invitation);
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

  const existingInvitation = await MembershipInvitationModel.findOne({
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

  return typeFromModel(existingInvitation);
}

export async function updateOrCreateInvitation(
  owner: WorkspaceType,
  inviteEmail: string,
  initialRole: ActiveRoleType,
  transaction?: Transaction
): Promise<MembershipInvitationType> {
  // check for prior existing pending invitation
  const existingInvitation = await MembershipInvitationModel.findOne({
    where: {
      workspaceId: owner.id,
      inviteEmail: sanitizeString(inviteEmail),
      status: "pending",
    },
    transaction,
  });

  if (existingInvitation) {
    await existingInvitation.update({
      initialRole,
    });
    return typeFromModel(existingInvitation);
  }

  return typeFromModel(
    await MembershipInvitationModel.create(
      {
        sId: generateRandomModelSId(),
        workspaceId: owner.id,
        inviteEmail: sanitizeString(inviteEmail),
        status: "pending",
        initialRole,
      },
      { transaction }
    )
  );
}

export function getMembershipInvitationToken(invitationId: number) {
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
  invitationId: ModelId
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
      email: "support@dust.help",
    },
    templateId: config.getInvitationEmailTemplate(),
    dynamic_template_data: {
      inviteLink: getMembershipInvitationUrl(owner, invitation.id),
      // Escape the name to prevent XSS attacks via injected script elements.
      inviterName: escape(user.fullName),
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

  const invitations = await MembershipInvitationModel.findAll({
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
  auth: Authenticator,
  transaction?: Transaction
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
  const invitations = await MembershipInvitationModel.findAll({
    where: {
      workspaceId: owner.id,
      status: ["pending", "revoked"],
      createdAt: {
        [Op.gt]: oneDayAgo,
      },
    },
    transaction,
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
      initialRole: i.initialRole,
      createdAt: i.createdAt.getTime(),
    });
  }

  return groupedInvitations;
}

export async function batchUnrevokeInvitations(
  auth: Authenticator,
  invitationIds: string[],
  transaction?: Transaction
) {
  const owner = auth.workspace();
  if (!owner || !auth.isAdmin()) {
    throw new Error(
      "Only users that are `admins` for the current workspace can see membership invitations or modify them."
    );
  }

  await MembershipInvitationModel.update(
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
      transaction,
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
    force = false,
  }: {
    owner: WorkspaceType;
    subscription: SubscriptionType;
    user: UserType;
    invitationRequests: MembershipInvitationBlob[];
    force?: boolean;
  }
): Promise<Result<HandleMembershipInvitationResult[], APIErrorWithStatusCode>> {
  const { maxUsers } = subscription.plan.limits.users;

  const result = await withTransaction(
    async (
      t
    ): Promise<
      Result<HandleMembershipInvitationResult[], APIErrorWithStatusCode>
    > => {
      // Only lock and check seats available if the workspace has a limits
      if (maxUsers !== -1) {
        await getWorkspaceAdministrationVersionLock(owner, t);

        const availableSeats =
          maxUsers -
          (await MembershipResource.getMembersCountForWorkspace({
            workspace: owner,
            activeOnly: true,
            transaction: t,
          }));

        if (availableSeats < invitationRequests.length) {
          return new Err({
            status_code: 400,
            api_error: {
              type: "plan_limit_error",
              message: `Not enough seats lefts (${availableSeats} seats remaining). Please upgrade or remove inactive members to add more.`,
            },
          });
        }
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

      const { members: existingMembers } = await getMembers(auth, {
        activeOnly: true,
        transaction: t,
      });

      const unconsumedInvitations = await getRecentPendingAndRevokedInvitations(
        auth,
        t
      );
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
      const emailsToSendInvitations = force
        ? invitationRequests // If force is true, send to all requested emails
        : invitationRequests.filter(
            (r) =>
              !emailsWithRecentUnconsumedInvitations.has(
                r.email.toLowerCase().trim()
              )
          );
      const invitationsToUnrevoke = force
        ? [] // If force is true, don't unrevoke any invitations
        : unconsumedInvitations.revoked.filter((i) =>
            requestedEmails.has(i.inviteEmail.toLowerCase().trim())
          );

      if (
        !emailsToSendInvitations.length &&
        !invitationsToUnrevoke.length &&
        invitationRequests.length > 0 &&
        !force // Only return this error if force is false
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
        invitationsToUnrevoke.map((i) => i.sId),
        t
      );

      const unrevokedResults: HandleMembershipInvitationResult[] =
        invitationsToUnrevoke.map((i) => ({
          success: true,
          email: i.inviteEmail,
        }));

      const invitationResults = await Promise.all(
        emailsToSendInvitations.map(async ({ email, role }) => {
          if (existingMembers.find((m) => m.email === email)) {
            return {
              success: false,
              email,
              error_message:
                "Cannot send invitation to existing active member.",
            };
          }

          try {
            const invitation = await updateOrCreateInvitation(
              owner,
              email,
              role,
              t
            );
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

      return new Ok([...invitationResults, ...unrevokedResults]);
    }
  );

  return result;
}
