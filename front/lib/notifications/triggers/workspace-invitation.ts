import type { EmailRecipient } from "@app/lib/notifications/transactional_emails";
import { triggerEmailWorkflow } from "@app/lib/notifications/transactional_emails";
import { WORKSPACE_INVITATION_TRIGGER_ID } from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { z } from "zod";

export const WorkspaceInvitationPayloadSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  inviterName: z.string().nullable(),
  inviteLink: z.string(),
  isReminder: z.boolean(),
});

export type WorkspaceInvitationPayloadType = z.infer<
  typeof WorkspaceInvitationPayloadSchema
>;

/**
 * Email an invitation (or its reminder) to join a workspace. The invitee usually has no Dust user,
 * so the email renders in the workspace's locale unless they already have one of their own.
 */
export function notifyWorkspaceInvitation({
  recipient,
  ...payload
}: WorkspaceInvitationPayloadType & {
  recipient: EmailRecipient;
}): Promise<Result<void, Error>> {
  return triggerEmailWorkflow({
    workflowId: WORKSPACE_INVITATION_TRIGGER_ID,
    recipients: [recipient],
    payload,
  });
}
