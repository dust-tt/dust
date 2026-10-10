import type { EmailRecipient } from "@app/lib/notifications/transactional_emails";
import { triggerEmailWorkflow } from "@app/lib/notifications/transactional_emails";
import { ACCESS_REQUEST_TRIGGER_ID } from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { z } from "zod";

export const AccessRequestPayloadSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  resourceKind: z.enum(["data_source", "mcp_server"]),
  resourceName: z.string(),
  requesterName: z.string(),
  requesterEmail: z.string(),
  message: z.string(),
});

export type AccessRequestPayloadType = z.infer<
  typeof AccessRequestPayloadSchema
>;

/**
 * Email the editor of a data source or of tools that a member requests access to. The email
 * cannot be replied to, so it links to the requester's address instead.
 */
export function notifyAccessRequest({
  recipient,
  ...payload
}: AccessRequestPayloadType & {
  recipient: EmailRecipient;
}): Promise<Result<void, Error>> {
  return triggerEmailWorkflow({
    workflowId: ACCESS_REQUEST_TRIGGER_ID,
    recipients: [recipient],
    payload,
  });
}
