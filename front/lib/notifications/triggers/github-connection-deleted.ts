import type { EmailRecipient } from "@app/lib/notifications/transactional_emails";
import { triggerEmailWorkflow } from "@app/lib/notifications/transactional_emails";
import { GITHUB_CONNECTION_DELETED_TRIGGER_ID } from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { z } from "zod";

export const GitHubConnectionDeletedPayloadSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
});

export type GitHubConnectionDeletedPayloadType = z.infer<
  typeof GitHubConnectionDeletedPayloadSchema
>;

export function notifyAdminsGitHubConnectionDeleted({
  admins,
  ...payload
}: GitHubConnectionDeletedPayloadType & {
  admins: EmailRecipient[];
}): Promise<Result<void, Error>> {
  return triggerEmailWorkflow({
    workflowId: GITHUB_CONNECTION_DELETED_TRIGGER_ID,
    recipients: admins,
    payload,
  });
}
