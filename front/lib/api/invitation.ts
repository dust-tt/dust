import type {
  ActiveRoleType,
  MembershipInvitationType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { Err, sanitizeString } from "@dust-tt/types";
import sgMail from "@sendgrid/mail";
import { sign } from "jsonwebtoken";
import { Op } from "sequelize";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { MembershipInvitation } from "@app/lib/models/workspace";
import { generateModelSId } from "@app/lib/utils";

sgMail.setApiKey(config.getSendgridApiKey());

function typeFromModel(
  invitation: MembershipInvitation
): MembershipInvitationType {
  return {
    sId: invitation.sId,
    id: invitation.id,
    inviteEmail: invitation.inviteEmail,
    status: invitation.status,
    initialRole: invitation.initialRole,
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

  return typeFromModel(invitation);
}

export async function updateInvitationStatus(
  auth: Authenticator,
  {
    invitation,
    status,
  }: {
    invitation: MembershipInvitationType;
    status: "pending" | "consumed" | "revoked";
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
    throw new Err("Invitaion unexpectedly not found.");
  }

  await existingInvitation.update({ status });

  return typeFromModel(existingInvitation);
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
    return typeFromModel(existingInvitation);
  }

  return typeFromModel(
    await MembershipInvitation.create({
      sId: generateModelSId(),
      workspaceId: owner.id,
      inviteEmail: sanitizeString(inviteEmail),
      status: "pending",
      initialRole,
    })
  );
}

export async function sendWorkspaceInvitationEmail(
  owner: WorkspaceType,
  user: UserType,
  invitation: MembershipInvitationType
) {
  const invitationToken = sign(
    { membershipInvitationId: invitation.id },
    config.getDustInviteTokenSecret()
  );

  const invitationUrl = `${config.getAppUrl()}/w/${
    owner.sId
  }/join/?t=${invitationToken}`;

  // Send invite email.
  const message = {
    to: invitation.inviteEmail,
    from: {
      name: "Dust team",
      email: "team@dust.tt",
    },
    templateId: config.getInvitationEmailTemplate(),
    dynamic_template_data: {
      inviteLink: invitationUrl,
      inviterName: user.fullName,
      workspaceName: owner.name,
    },
  };
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
      initialRole: i.initialRole,
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
      initialRole: i.initialRole,
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
