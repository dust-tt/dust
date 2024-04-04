import type {
  ActiveRoleType,
  MembershipInvitationType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { sanitizeString } from "@dust-tt/types";
import sgMail from "@sendgrid/mail";
import { sign } from "jsonwebtoken";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { MembershipInvitation } from "@app/lib/models";
import { generateModelSId } from "@app/lib/utils";

sgMail.setApiKey(config.getSendgridApiKey());

function typeFromModel(
  invitation: MembershipInvitation
): MembershipInvitationType {
  return {
    id: invitation.id,
    inviteEmail: invitation.inviteEmail,
    status: invitation.status,
    initialRole: invitation.initialRole,
  };
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

export async function updateInvitation(
  owner: WorkspaceType,
  id: number,
  status: "pending" | "consumed" | "revoked"
): Promise<MembershipInvitationType> {
  const invitation = await MembershipInvitation.findOne({
    where: {
      id,
      workspaceId: owner.id,
    },
  });

  if (!invitation) {
    throw new Error("Invitation not found");
  }

  await invitation.update({
    status,
  });

  return typeFromModel(invitation);
}

export async function deleteInvitation(
  owner: WorkspaceType,
  id: number
): Promise<void> {
  await MembershipInvitation.destroy({
    where: {
      id,
      workspaceId: owner.id,
    },
  });
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

  const invitations = await MembershipInvitation.findAll({
    where: {
      workspaceId: owner.id,
      status: "pending",
    },
  });

  return invitations.map((i) => {
    return {
      id: i.id,
      status: i.status,
      inviteEmail: i.inviteEmail,
      initialRole: i.initialRole,
    };
  });
}
