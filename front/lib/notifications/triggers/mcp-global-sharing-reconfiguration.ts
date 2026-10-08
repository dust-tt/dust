import type { EmailRecipient } from "@app/lib/notifications/transactional_emails";
import { triggerEmailWorkflow } from "@app/lib/notifications/transactional_emails";
import { MCP_GLOBAL_SHARING_RECONFIGURATION_TRIGGER_ID } from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { z } from "zod";

export const MCPGlobalSharingReconfigurationPayloadSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  toolName: z.string(),
  agentNames: z.array(z.string()),
});

export type MCPGlobalSharingReconfigurationPayloadType = z.infer<
  typeof MCPGlobalSharingReconfigurationPayloadSchema
>;

export function notifyAdminsMCPGlobalSharingReconfiguration({
  admins,
  ...payload
}: MCPGlobalSharingReconfigurationPayloadType & {
  admins: EmailRecipient[];
}): Promise<Result<void, Error>> {
  return triggerEmailWorkflow({
    workflowId: MCP_GLOBAL_SHARING_RECONFIGURATION_TRIGGER_ID,
    recipients: admins,
    payload,
  });
}
