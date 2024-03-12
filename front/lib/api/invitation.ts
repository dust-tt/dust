import type { UserType, WorkspaceType } from "@dust-tt/types";
import sgMail from "@sendgrid/mail";
import { sign } from "jsonwebtoken";

import config from "@app/lib/api/config";
import { MembershipInvitation } from "@app/lib/models";

sgMail.setApiKey(config.getSendgridApiKey());

export async function sendWorkspaceInvitationEmail(
  owner: WorkspaceType,
  user: UserType,
  inviteEmail: string
): Promise<MembershipInvitation> {
  // Create MembershipInvitation.
  const invitation = await MembershipInvitation.create({
    workspaceId: owner.id,
    inviteEmail,
    status: "pending",
  });

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

  return invitation;
}
